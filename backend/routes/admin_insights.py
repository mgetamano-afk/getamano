"""routes/admin_insights.py — CEO-facing analytics endpoints.

Section 90 (V19.3 refactor).

Extracted from `server.py` lines 3370-3877 to bring server.py below the
11k-LOC threshold and to give the CEO Code-Health dashboard a real
counter-example: this very file is the first practical win of the
self-introspection loop the founder seeded.

Endpoints exposed (all require admin):
  • GET  /admin/ceo-metrics  — executive dashboard JSON
  • GET  /admin/code-health  — pyflakes / test count / file LOC hotspots
  • GET  /admin/daily-brief  — AI-generated morning summary (Claude)

Why a router factory?
We follow the same `make_router(db, ...)` pattern used by every other
file under /routes/. It keeps the function dependencies explicit (db,
require_admin, milestone_defs, logger) instead of relying on module-level
globals — which is what made `server.py` impossible to slice in the
first place.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, Depends

# Plan pricing — single source of truth. Mirrors GET /api/plans.
PLAN_PRICES = {"free": 0, "basic": 10, "pro": 15, "premium": 25}

# In-process cache for /admin/code-health. The subprocess calls (ruff,
# pytest --collect-only) take ~2-3s combined; refreshing on every dash
# load would be wasteful. 10-min TTL is plenty for a CEO dashboard that
# polls every 60s.
_CODE_HEALTH_CACHE: dict = {"data": None, "at": 0.0}


def _compute_code_health() -> dict:
    """Snapshot the codebase. Runs in a thread (see endpoint) so the
    blocking subprocess work doesn't stall the event loop."""
    backend_root = Path(__file__).resolve().parent.parent

    def _safe_run(cmd: list[str], timeout: int = 25) -> tuple[int, str]:
        try:
            r = subprocess.run(cmd, cwd=str(backend_root), capture_output=True, text=True, timeout=timeout)
            return r.returncode, (r.stdout or "") + (r.stderr or "")
        except Exception as exc:  # noqa: BLE001
            return -1, f"<error: {exc}>"

    # Ruff (F-rule pyflakes-only). Invoke via `sys.executable -m ruff`
    # so it resolves through the FastAPI venv module path and avoids
    # supervisord PATH issues.
    rc_f, out_f = _safe_run([sys.executable, "-m", "ruff", "check", "--select=F", "--no-cache", "--quiet", "--output-format=concise", "."], timeout=15)
    f_errors = sum(1 for ln in out_f.splitlines() if ":" in ln and ln.strip() and not ln.startswith("Found"))

    # Ruff (full default ruleset)
    rc_all, out_all = _safe_run([sys.executable, "-m", "ruff", "check", "--no-cache", "--quiet", "--statistics", "."], timeout=30)
    total_findings = 0
    for ln in out_all.splitlines():
        parts = ln.strip().split()
        if parts and parts[0].isdigit():
            total_findings += int(parts[0])

    # Test count via pytest --collect-only -q. Match "(N) tests collected"
    # regex regardless of trailing junk (errors-during-collection summary).
    rc_t, out_t = _safe_run([sys.executable, "-m", "pytest", "tests/", "--collect-only", "-q"], timeout=30)
    test_count = 0
    for ln in out_t.splitlines():
        m = re.search(r"(\d+)\s+tests?\s+collected", ln)
        if m:
            try:
                test_count = int(m.group(1))
                break
            except Exception:  # noqa: BLE001
                pass

    # File-size hotspots — anything > 400 LOC is a refactor signal.
    hotspots: list[dict] = []
    for sub in ("routes", "services", "integrations"):
        d = backend_root / sub
        if not d.is_dir():
            continue
        for path in d.glob("*.py"):
            try:
                lines = sum(1 for _ in path.open(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                continue
            if lines > 400:
                hotspots.append({"file": f"{sub}/{path.name}", "loc": lines})
    server_path = backend_root / "server.py"
    if server_path.exists():
        try:
            hotspots.append({"file": "server.py", "loc": sum(1 for _ in server_path.open(encoding="utf-8"))})
        except Exception:  # noqa: BLE001
            pass
    hotspots.sort(key=lambda h: -h["loc"])
    hotspots = hotspots[:8]

    tests_dir = backend_root / "tests"
    test_files = len(list(tests_dir.glob("test_*.py"))) if tests_dir.is_dir() else 0

    rc_git, out_git = _safe_run(["git", "rev-parse", "--short", "HEAD"], timeout=5)
    commit = out_git.strip().splitlines()[-1] if out_git.strip() else "unknown"

    # V19.5 — server.py LOC timeline. Trace the file's size across the
    # last N commits via `git log --pretty=%H|%cI` + `git show <hash>:server.py | wc -l`.
    # This gives the founder a visual "the refactor curve is going down"
    # signal — and stops the worry that the dashboard verdict could
    # whip-saw between green/yellow on a single warning. Bounded to 40
    # commits + 12s total to keep the request snappy.
    loc_history: list[dict] = []
    try:
        # `git log -- <path>` resolves <path> relative to the CURRENT
        # WORKING DIRECTORY (so `server.py` works because subprocess
        # cwd is /app/backend). But `git show <hash>:<path>` resolves
        # <path> relative to the REPO ROOT (so we need
        # `backend/server.py`). Both forms required.
        rc_top, out_top = _safe_run(["git", "rev-parse", "--show-toplevel"], timeout=3)
        repo_root = out_top.strip().splitlines()[-1] if out_top.strip() else str(backend_root)
        try:
            rel_from_root = str((backend_root / "server.py").resolve().relative_to(repo_root))
        except Exception:  # noqa: BLE001
            rel_from_root = "server.py"

        rc_log, out_log = _safe_run([
            "git", "log", "--pretty=format:%H|%cI", "-n", "40", "--", "server.py",
        ], timeout=5)
        seen_hashes: set = set()
        for ln in out_log.splitlines():
            ln = ln.strip()
            if not ln or "|" not in ln:
                continue
            full_hash, iso = ln.split("|", 1)
            short = full_hash[:7]
            if short in seen_hashes:
                continue
            seen_hashes.add(short)
            rc_ls, out_ls = _safe_run(["git", "show", f"{full_hash}:{rel_from_root}"], timeout=3)
            if rc_ls != 0 or out_ls.startswith("<error"):
                continue
            line_count = out_ls.count("\n")
            loc_history.append({"commit": short, "at": iso, "loc": line_count})
        loc_history.reverse()
    except Exception:  # noqa: BLE001
        loc_history = []

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": commit,
        "ruff": {
            "pyflakes_errors": f_errors,
            "total_findings": total_findings,
            "passing": rc_f == 0,
        },
        "tests": {
            "total_test_files": test_files,
            "total_tests_collected": test_count,
        },
        "hotspots": hotspots,
        "loc_history": loc_history,
        "verdict": "green" if (rc_f == 0 and total_findings < 50) else ("yellow" if total_findings < 200 else "red"),
    }


def make_router(
    *,
    db: Any,
    User: Any,
    require_admin: Callable[..., Any],
    milestone_defs: list,
    logger: logging.Logger | None = None,
) -> APIRouter:
    router = APIRouter()
    log = logger or logging.getLogger(__name__)

    @router.get("/admin/ceo-metrics")
    async def ceo_metrics(admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        """Executive dashboard: live activity, growth, revenue projections, top performers."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week_start = (now - timedelta(days=7)).isoformat()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

        # === Volume ===
        total_users = await db.users.count_documents({})
        total_providers = await db.provider_profiles.count_documents({"is_active": True})
        approved = await db.provider_profiles.count_documents({"verification_status": "approved", "is_active": True})
        pending = await db.provider_profiles.count_documents({"verification_status": "pending"})
        total_clients = total_users - await db.provider_profiles.count_documents({})
        if total_clients < 0:
            total_clients = 0

        # === Acquisition (signups by period) ===
        signups_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
        signups_yesterday = await db.users.count_documents({"created_at": {"$gte": yesterday_start, "$lt": today_start}})
        signups_week = await db.users.count_documents({"created_at": {"$gte": week_start}})
        signups_month = await db.users.count_documents({"created_at": {"$gte": month_start}})
        providers_today = await db.provider_profiles.count_documents({"created_at": {"$gte": today_start}})
        providers_week = await db.provider_profiles.count_documents({"created_at": {"$gte": week_start}})
        providers_month = await db.provider_profiles.count_documents({"created_at": {"$gte": month_start}})

        # === Engagement ===
        msgs_today = await db.messages.count_documents({"created_at": {"$gte": today_start}}) if "messages" in await db.list_collection_names() else 0
        requests_today = await db.service_requests.count_documents({"created_at": {"$gte": today_start}})
        reviews_today = await db.reviews.count_documents({"created_at": {"$gte": today_start}})
        milestones_today = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": today_start}})
        milestones_week = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": week_start}})
        total_milestones = await db.provider_milestones.count_documents({})
        likes_today = await db.likes.count_documents({"created_at": {"$gte": today_start}}) if "likes" in await db.list_collection_names() else 0

        # === Plan distribution ===
        plan_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
        ]
        plan_rows = await db.provider_profiles.aggregate(plan_pipeline).to_list(20)
        plans_dist = {r["_id"] or "free": r["count"] for r in plan_rows}

        # === Revenue projection (MRR + ARR) ===
        mrr = sum(PLAN_PRICES.get(plan, 0) * count for plan, count in plans_dist.items())
        arr = mrr * 12
        founding_count = await db.users.count_documents({"founding_member": True})

        # === Geographic distribution ===
        state_pipeline = [
            {"$match": {"is_active": True, "state": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        state_rows = await db.provider_profiles.aggregate(state_pipeline).to_list(10)
        top_states = [{"state": r["_id"], "count": r["count"]} for r in state_rows]

        # === Categories distribution ===
        cat_pipeline = [
            {"$match": {"is_active": True, "category_id": {"$ne": None}}},
            {"$group": {"_id": "$category_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 8},
        ]
        cat_rows = await db.provider_profiles.aggregate(cat_pipeline).to_list(8)
        cats_meta = {c["category_id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(100)}
        top_categories = [{
            "category_id": r["_id"],
            "name": cats_meta.get(r["_id"], {}).get("name_es", r["_id"]),
            "count": r["count"],
        } for r in cat_rows]

        # === Top performers (by views) ===
        top_pipeline = [
            {"$match": {"is_active": True, "verification_status": "approved"}},
            {"$sort": {"views": -1}},
            {"$limit": 5},
            {"$project": {"_id": 0, "slug": 1, "business_name": 1, "views": 1, "contact_clicks": 1, "rating_avg": 1, "rating_count": 1, "city": 1, "state": 1, "logo_url": 1, "likes_count": 1, "plan": 1}},
        ]
        top_performers = await db.provider_profiles.aggregate(top_pipeline).to_list(5)

        # === Recent activity feed (mixed) ===
        activity = []
        async for u in db.users.find({}, {"_id": 0, "name": 1, "created_at": 1, "role": 1}).sort("created_at", -1).limit(5):
            activity.append({"type": "signup", "at": u.get("created_at"), "title": f"{(u.get('name') or 'Nuevo usuario').split(' ')[0]} se registró", "role": u.get("role")})
        defs_by_id = {d["id"]: d for d in milestone_defs}
        async for m in db.provider_milestones.find({}, {"_id": 0}).sort("unlocked_at", -1).limit(5):
            d = defs_by_id.get(m["milestone_id"])
            if not d:
                continue
            prof = await db.provider_profiles.find_one({"user_id": m["user_id"]}, {"_id": 0, "business_name": 1})
            if not prof or (prof.get("business_name") or "").startswith("TEST_"):
                continue
            activity.append({"type": "milestone", "at": m["unlocked_at"], "title": f"{prof.get('business_name', 'Alguien')} desbloqueó {d['title']}", "tier": d["tier"]})
        activity.sort(key=lambda x: x.get("at") or "", reverse=True)
        activity = activity[:10]

        # === Founding cupos ===
        founding = await db.promo_codes.find_one({"code": "GETAMANO50"}, {"_id": 0}) or {}

        return {
            "generated_at": now.isoformat(),
            "volume": {
                "total_users": total_users,
                "total_clients": total_clients,
                "total_providers": total_providers,
                "approved_providers": approved,
                "pending_providers": pending,
            },
            "acquisition": {
                "signups": {"today": signups_today, "yesterday": signups_yesterday, "week": signups_week, "month": signups_month},
                "new_providers": {"today": providers_today, "week": providers_week, "month": providers_month},
            },
            "engagement": {
                "messages_today": msgs_today,
                "requests_today": requests_today,
                "reviews_today": reviews_today,
                "likes_today": likes_today,
                "milestones_today": milestones_today,
                "milestones_week": milestones_week,
                "total_milestones_unlocked": total_milestones,
            },
            "revenue": {
                "mrr_usd": mrr,
                "arr_usd": arr,
                "by_plan": plans_dist,
                "founding_members_count": founding_count,
                "founding_used": founding.get("current_uses", 0),
                "founding_max": founding.get("max_uses", 50),
                "plan_prices": PLAN_PRICES,
            },
            "geography": {"top_states": top_states},
            "categories": {"top": top_categories},
            "top_performers": top_performers,
            "activity": activity,
        }

    @router.get("/admin/code-health")
    async def code_health(admin: User = Depends(require_admin)):  # type: ignore[valid-type]
        """Return ruff / test / complexity stats so the CEO can sanity-check
        external audit reports. Cached 10 minutes per commit hash."""
        now = time.time()
        if _CODE_HEALTH_CACHE["data"] and (now - _CODE_HEALTH_CACHE["at"] < 600):
            return _CODE_HEALTH_CACHE["data"]
        data = await asyncio.to_thread(_compute_code_health)
        _CODE_HEALTH_CACHE["data"] = data
        _CODE_HEALTH_CACHE["at"] = now
        return data

    @router.get("/admin/daily-brief")
    async def daily_brief(admin: User = Depends(require_admin), language: str = "es", regenerate: bool = False):  # type: ignore[valid-type]
        """AI-generated executive daily brief — warm CEO morning summary in natural language."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cache_id = f"brief_{today_key}_{language}"
        if not regenerate:
            cached = await db.daily_briefs.find_one({"brief_id": cache_id}, {"_id": 0})
            if cached:
                return cached

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week_start = (now - timedelta(days=7)).isoformat()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        three_days_ago = (now - timedelta(days=3)).isoformat()

        signups_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
        signups_yesterday = await db.users.count_documents({"created_at": {"$gte": yesterday_start, "$lt": today_start}})
        signups_week = await db.users.count_documents({"created_at": {"$gte": week_start}})
        providers_today = await db.provider_profiles.count_documents({"created_at": {"$gte": today_start}})
        total_providers = await db.provider_profiles.count_documents({"is_active": True})
        pending = await db.provider_profiles.count_documents({"verification_status": "pending"})
        pending_stale = await db.provider_profiles.count_documents({"verification_status": "pending", "created_at": {"$lt": three_days_ago}})
        milestones_today = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": today_start}})
        milestones_yesterday = await db.provider_milestones.count_documents({"unlocked_at": {"$gte": yesterday_start, "$lt": today_start}})
        requests_today = await db.service_requests.count_documents({"created_at": {"$gte": today_start}})

        total_clients = await db.users.count_documents({"role": "client"})
        zero_view_providers = await db.provider_profiles.count_documents({"is_active": True, "verification_status": "approved", "$or": [{"views": 0}, {"views": {"$exists": False}}]})
        no_contact_providers = await db.provider_profiles.count_documents({"is_active": True, "verification_status": "approved", "views": {"$gt": 5}, "$or": [{"contact_clicks": 0}, {"contact_clicks": {"$exists": False}}]})
        incomplete_providers = await db.provider_profiles.count_documents({"is_active": True, "$or": [{"gallery": {"$exists": False}}, {"gallery": {"$size": 0}}]})
        state_providers = {}
        async for row in db.provider_profiles.aggregate([
            {"$match": {"is_active": True}},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}},
        ]):
            state_providers[row["_id"]] = row["count"]
        top_state = max(state_providers, key=state_providers.get) if state_providers else None
        top_state_providers = state_providers.get(top_state, 0) if top_state else 0

        plan_rows = await db.provider_profiles.aggregate([
            {"$match": {"is_active": True}},
            {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
        ]).to_list(20)
        plans = {r["_id"] or "free": r["count"] for r in plan_rows}
        free_count = plans.get("free", 0)
        mrr = sum(PLAN_PRICES.get(p, 0) * c for p, c in plans.items())

        stale_pending = []
        async for p in db.provider_profiles.find(
            {"verification_status": "pending", "created_at": {"$lt": three_days_ago}},
            {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "created_at": 1, "category_id": 1},
        ).sort("created_at", 1).limit(5):
            stale_pending.append(p)

        fourteen_ago = (now - timedelta(days=14)).isoformat()
        inactive_top = []
        async for p in db.provider_profiles.find(
            {"is_active": True, "verification_status": "approved", "$or": [{"views": 0}, {"views": {"$exists": False}}], "created_at": {"$lt": fourteen_ago}},
            {"_id": 0, "slug": 1, "business_name": 1, "city": 1, "state": 1, "category_id": 1},
        ).limit(5):
            inactive_top.append(p)

        leader_rows = await db.provider_milestones.aggregate([
            {"$match": {"unlocked_at": {"$gte": month_start}}},
            {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 3},
        ]).to_list(3)
        leader = None
        if leader_rows:
            lp = await db.provider_profiles.find_one({"user_id": leader_rows[0]["_id"]}, {"_id": 0, "business_name": 1, "city": 1, "state": 1})
            if lp and not (lp.get("business_name") or "").startswith("TEST_"):
                leader = {"name": lp.get("business_name"), "city": lp.get("city"), "count": leader_rows[0]["count"]}

        founding = await db.promo_codes.find_one({"code": "GETAMANO50"}, {"_id": 0}) or {}
        founding_remaining = founding.get("max_uses", 50) - founding.get("current_uses", 0)

        signup_delta = "—"
        if signups_yesterday > 0:
            d = signups_today - signups_yesterday
            pct = int(abs(d) / max(signups_yesterday, 1) * 100)
            signup_delta = f"{'+' if d >= 0 else '-'}{pct}% vs ayer"

        metrics = {
            "fecha": now.strftime("%d de %B de %Y"),
            "signups_hoy": signups_today,
            "signup_delta": signup_delta,
            "signups_semana": signups_week,
            "proveedores_nuevos_hoy": providers_today,
            "proveedores_activos": total_providers,
            "clientes_totales": total_clients,
            "ratio_provider_to_client": round(total_providers / max(total_clients, 1), 2),
            "pendientes_aprobacion": pending,
            "pendientes_atrasados_3dias_o_mas": pending_stale,
            "proveedores_zero_views": zero_view_providers,
            "proveedores_views_pero_sin_contactos": no_contact_providers,
            "proveedores_sin_galeria": incomplete_providers,
            "estado_con_mas_proveedores": top_state,
            "proveedores_en_estado_top": top_state_providers,
            "hitos_desbloqueados_hoy": milestones_today,
            "hitos_ayer": milestones_yesterday,
            "solicitudes_hoy": requests_today,
            "mrr_usd": mrr,
            "free_count": free_count,
            "founding_restantes": founding_remaining,
            "lider_del_mes": leader,
        }

        system_msg_brief = (
            "Eres el compañero de café matutino de Verónica, CEO de getamano (marketplace que conecta a la comunidad latina en USA con proveedores latinos verificados). "
            "Entrégale un brief CÁLIDO, BREVE y HUMANO en español, tono de confidente. "
            "Habla en SEGUNDA PERSONA. Máximo 4-5 oraciones. Incluye un dato concreto y una emoción. "
            "Celebra logros con honestidad, sé esperanzador con caídas. TERMINA con una frase de ánimo no cliché. "
            "NO uses listas ni markdown."
        )
        narrative = ""
        try:
            chat = LlmChat(
                api_key=os.environ.get("EMERGENT_LLM_KEY"),
                session_id=f"{cache_id}_brief",
                system_message=system_msg_brief,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            narrative = (await chat.send_message(UserMessage(text=f"Métricas de hoy: {metrics}"))).strip()
        except Exception:
            log.exception("Daily brief narrative failed")
            narrative = f"Buen día, Verónica. Hoy tenemos {signups_today} nuevos usuarios y {milestones_today} hitos celebrados. MRR ${mrr}/mes. Sigamos construyendo. 🧡"

        system_msg_recs = (
            "Eres consultor estratégico de getamano (marketplace latino en USA, fase early-stage). "
            "Tu prioridad #1 es TRACCIÓN DE CLIENTES y CONVERSIÓN. "
            "Analiza las métricas y propone 3-4 acciones CONCRETAS, PRIORIZADAS y EJECUTABLES esta semana. "
            "Cada acción debe tener:\n"
            "  - title (corto, en español, accionable, empezando con verbo)\n"
            "  - why (1 oración con el dato/evidencia de las métricas)\n"
            "  - action (1-2 oraciones con el paso CONCRETO a hacer hoy/esta semana)\n"
            "  - priority (high/medium/low) — solo 1 high máximo\n"
            "  - icon (uno de: 'users','target','dollar','growth','support','marketing','retention','urgent')\n"
            "  - impact_estimate (corto, ej: '+15% conversión', '+$500 MRR', '5 ventas/semana')\n"
            "Enfócate en: captación de clientes, activación de proveedores dormidos, upgrade de free→pro, retención, geographic expansion, viralización. "
            "Sé específico: nombra ciudades, números, nombres de proveedores reales si los tienes. "
            "Responde SOLO con JSON válido en este formato: "
            '{"recommendations": [{"title":"...", "why":"...", "action":"...", "priority":"high|medium|low", "icon":"...", "impact_estimate":"..."}]}'
        )
        recommendations: list[dict] = []
        try:
            chat_recs = LlmChat(
                api_key=os.environ.get("EMERGENT_LLM_KEY"),
                session_id=f"{cache_id}_recs",
                system_message=system_msg_recs,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            raw = await chat_recs.send_message(UserMessage(text=(
                f"Métricas operativas de getamano:\n{metrics}\n\n"
                f"Proveedores aprobados pero sin actividad reciente (top 5):\n{inactive_top}\n\n"
                f"Pendientes de verificación con más de 3 días (top 5):\n{stale_pending}\n\n"
                "Devuelve SOLO el JSON con recomendaciones de tracción para esta semana."
            )))
            import json as _json
            clean = (raw or "").strip()
            if clean.startswith("```"):
                clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", clean, flags=re.MULTILINE).strip()
            parsed = _json.loads(clean)
            recommendations = parsed.get("recommendations", [])[:5]
        except Exception:
            log.exception("Daily brief recommendations failed")
            recommendations = []
            if pending_stale > 0:
                recommendations.append({
                    "title": f"Aprobar {pending_stale} proveedores atrasados",
                    "why": f"{pending_stale} proveedores llevan más de 3 días esperando verificación. Cada día perdido es un cliente que no llegó.",
                    "action": "Entra a 'Cola de verificación' y procesa los pendientes más antiguos hoy mismo.",
                    "priority": "high",
                    "icon": "urgent",
                    "impact_estimate": f"+{pending_stale * 5} clientes potenciales/mes",
                })
            if zero_view_providers > 0:
                recommendations.append({
                    "title": f"Activar {zero_view_providers} proveedores con 0 vistas",
                    "why": f"{zero_view_providers} negocios aprobados nunca recibieron una visita. Sin tráfico no hay conversión.",
                    "action": "Envía un email/WhatsApp masivo invitándolos a compartir su eCard. Dales el QR descargable y el copy listo.",
                    "priority": "high",
                    "icon": "growth",
                    "impact_estimate": "+30% activación",
                })
            if free_count > 5:
                recommendations.append({
                    "title": f"Upgrade campaign: {free_count} en Free",
                    "why": f"Tienes {free_count} proveedores en Free. Con conversión 10% al plan Pro ganarías ~${free_count * 0.1 * 15:.0f}/mes.",
                    "action": "Lanza una campaña con beneficios Pro vs Free + descuento founding mientras queden cupos.",
                    "priority": "medium",
                    "icon": "dollar",
                    "impact_estimate": f"+${int(free_count * 0.1 * 15)}/mes",
                })

        highlights = []
        if signups_today > 0:
            highlights.append({"icon": "users", "label": f"{signups_today} nuevos usuarios", "delta": signup_delta if signups_yesterday > 0 else None})
        if milestones_today > 0:
            highlights.append({"icon": "trophy", "label": f"{milestones_today} hitos desbloqueados", "delta": f"{milestones_today - milestones_yesterday:+d} vs ayer" if milestones_yesterday > 0 else None})
        if pending > 0:
            highlights.append({"icon": "shield", "label": f"{pending} proveedores esperando aprobación", "urgent": pending_stale > 0, "sub": f"{pending_stale} atrasados >3 días" if pending_stale > 0 else None})
        if leader:
            highlights.append({"icon": "crown", "label": f"Líder del mes: {leader['name']}", "sub": f"{leader['count']} logros · {leader.get('city') or ''}"})
        highlights.append({"icon": "dollar", "label": f"MRR ${mrr}/mes · ARR ${mrr*12}", "sub": f"{founding.get('current_uses', 0)}/{founding.get('max_uses', 50)} founding"})

        result = {
            "brief_id": cache_id,
            "date": now.strftime("%A, %d de %B de %Y").lower(),
            "date_iso": today_key,
            "generated_at": now.isoformat(),
            "narrative": narrative,
            "highlights": highlights,
            "recommendations": recommendations,
            "raw_metrics": metrics,
        }
        await db.daily_briefs.update_one({"brief_id": cache_id}, {"$set": result}, upsert=True)
        result.pop("_id", None)
        return result

    return router
