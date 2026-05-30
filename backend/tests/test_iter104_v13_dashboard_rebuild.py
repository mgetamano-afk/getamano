"""
Iteration 104 — V13 unified vertical sidebar + new dashboard sections.

Locks (source-code assertions):
  · The horizontal `dashboard-tabs` strip in ProviderDashboard.jsx is gone.
  · ProviderSideNav has the 4 final groups (DASHBOARD/NEGOCIO/CRECER/ADMIN)
    with the V13 item set including "banner", "diario" and "verificarme".
  · The "suscripcion" tab content is removed in favour of `VerificationCenter`.
  · ProviderDashboard has a mobile hamburger button + drawer wiring.
  · VerificationCenter renders the 3 tiers + reward ladder + ecards list.
  · ReferralsTab uses the V13 "Mi cartera / Mi wallet" widget and the
    reward ladder (2/4/6/8/10/12 paid refs → 1/2/3/4/6/12 months).
  · PhysicalCardsPanel ships a live <PhysicalCardPreview/> mock-up.
"""
import os


def _read(rel: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel)
    with open(full, encoding="utf-8") as f:
        return f.read()


# ─── Horizontal tab strip removal ─────────────────────────────────
def test_horizontal_tab_strip_removed():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert 'data-testid="dashboard-tabs"' not in src
    assert "TAB_KEYS.map" not in src


def test_suscripcion_tab_content_removed():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    # Legacy block was removed; users now go through VerificationCenter.
    assert 'data-testid="dashboard-subscription"' not in src
    assert 'tab === "suscripcion"' not in src


# ─── New sidebar groups + items ───────────────────────────────────
def test_sidenav_has_v13_groups_and_items():
    src = _read("frontend/src/components/ProviderSideNav.jsx")
    # 4 groups in stable order
    assert 'id: "dashboard"' in src
    assert 'id: "negocio"' in src
    assert 'id: "crecer"' in src
    assert 'id: "admin"' in src
    # New items
    for tid in ("banner", "diario", "verificarme"):
        assert f'id: "{tid}"' in src, f"missing item id {tid}"
    # Verify the plural rename is in place
    assert '"Mis eCards"' in src and '"My eCards"' in src


def test_sidenav_renders_mobile_drawer():
    src = _read("frontend/src/components/ProviderSideNav.jsx")
    assert 'data-testid="provider-sidenav-mobile"' in src
    assert 'data-testid="provider-sidenav-mobile-overlay"' in src
    assert 'data-testid="provider-sidenav-mobile-close"' in src
    assert "mobileOpen" in src
    # Body scroll lock when drawer open
    assert "document.body.style.overflow" in src


def test_dashboard_renders_mobile_menu_button():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert 'data-testid="provider-dashboard-mobile-menu-btn"' in src
    assert 'data-testid="provider-dashboard-mobile-tab-label"' in src
    assert "mobileNavOpen" in src
    assert "setMobileNavOpen" in src


# ─── New panels wiring ────────────────────────────────────────────
def test_verificarme_tab_renders_verification_center():
    src = _read("frontend/src/pages/ProviderDashboard.jsx")
    assert 'tab === "verificarme"' in src
    assert "VerificationCenter" in src


def test_verification_center_has_tiers_and_rewards():
    src = _read("frontend/src/components/VerificationCenter.jsx")
    # 3 tiers visible (rendered via template literal data-testid)
    assert "verification-tier-${tier}" in src
    # Reward widget + ladder + 6 reward tiers
    assert 'data-testid="verification-rewards-widget"' in src
    assert 'data-testid="verification-rewards-progress"' in src
    assert "rewards-tier-${r.refs}" in src
    # Reward ladder math (2->1, 4->2, 6->3, 8->4, 10->6, 12->12)
    assert "refs: 2,  months: 1" in src
    assert "refs: 4,  months: 2" in src
    assert "refs: 12, months: 12" in src


def test_referrals_tab_is_mi_wallet_widget():
    src = _read("frontend/src/components/ReferralsTab.jsx")
    assert 'data-testid="mi-wallet-widget"' in src
    assert 'data-testid="ref-reward-ladder"' in src
    assert 'data-testid="ref-next-progress"' in src
    # Updated ladder (no more "1 mes gratis por referido" plain copy)
    assert "Recomienda y gana meses gratis" in src
    assert "refs: 12, months: 12" in src


def test_physical_card_preview_mockup_present():
    src = _read("frontend/src/components/PhysicalCardsPanel.jsx")
    assert "PhysicalCardPreview" in src
    assert 'data-testid="physical-card-preview"' in src
    assert 'data-testid="physical-card-preview-front"' in src
    assert 'data-testid="physical-card-preview-back"' in src
    # Slug shown on the back of the card
    assert "getamano.us/p/" in src
