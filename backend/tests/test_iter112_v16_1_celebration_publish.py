"""V16.1 — Post-payment / post-verification share celebration.

The dashboard surfaces a celebration banner inside ShareLinkCard when
arrived at via `?celebrate=new_ecard` or `?celebrate=verified`. The banner
is dismissed automatically by stripping the URL param so a manual reload
doesn't replay it.

Source-code locks only — the celebration is a pure frontend flow with
no backend surface (the existing /providers POST + sandbox-pay endpoints
already handle persistence).
"""
from __future__ import annotations

import re


SHARE_CARD_PATH = "/app/frontend/src/components/ShareLinkCard.jsx"
DASHBOARD_PATH = "/app/frontend/src/pages/ProviderDashboard.jsx"
ONBOARDING_PATH = "/app/frontend/src/pages/ProviderOnboarding.jsx"
VERIFY_CENTER_PATH = "/app/frontend/src/components/VerificationCenter.jsx"
ECARDS_PANEL_PATH = "/app/frontend/src/components/EcardsManagerPanel.jsx"


def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def test_share_card_accepts_celebration_prop():
    """ShareLinkCard must accept the `celebrationKind` prop and render the
    celebration banner when set to either 'new_ecard' or 'verified'."""
    src = _read(SHARE_CARD_PATH)
    assert "celebrationKind" in src
    assert 'data-testid="share-link-celebration-banner"' in src
    # Both copy variants must be present
    assert "Tu nueva eCard está lista" in src
    assert "Estás verificado" in src
    # Banner is conditional on the prop
    assert "{celebrationKind &&" in src


def test_share_card_auto_scrolls_when_celebrating():
    """When celebrationKind is truthy, the card must scroll itself into
    view so the user lands directly on the share UI."""
    src = _read(SHARE_CARD_PATH)
    assert "scrollIntoView" in src
    assert "rootRef" in src


def test_dashboard_consumes_celebrate_param():
    """ProviderDashboard must read `?celebrate=` from the URL, switch to
    the dashboard home tab so ShareLinkCard renders, and strip the param
    so a refresh doesn't replay the banner."""
    src = _read(DASHBOARD_PATH)
    # Param is read and validated
    assert 'searchParams.get("celebrate")' in src
    assert '"new_ecard"' in src
    assert '"verified"' in src
    # Tab is forced to dashboard (where ShareLinkCard renders)
    assert 'setTab("dashboard")' in src
    # URL param is stripped after consumption
    assert 'next.delete("celebrate")' in src
    # Kind is plumbed into the ShareLinkCard prop
    assert "celebrationKind={celebrationKind}" in src


def test_onboarding_redirects_to_celebration():
    """After eCard creation succeeds, the onboarding must redirect to
    /dashboard/provider?celebrate=new_ecard&slug=... — NOT to the public
    eCard route as before. This puts the provider in front of the share
    UI immediately after paying."""
    src = _read(ONBOARDING_PATH)
    assert "celebrate=new_ecard" in src
    # Sanity — the redirect happens RIGHT AFTER POST /providers succeeds
    assert re.search(
        r"toast\.success\([^)]*Tu eCard está lista[^)]*\);\s*"
        r"(//[^\n]*\n\s*)*"  # optional comments
        r"navigate\([^)]*celebrate=new_ecard",
        src,
    ), "celebration redirect must be wired right after the eCard-ready toast"


def test_verification_center_redirects_to_celebration():
    """VerificationCenter must redirect to the celebration when the user
    activates verification (not when they turn it off)."""
    src = _read(VERIFY_CENTER_PATH)
    assert "celebrate=verified" in src
    assert "useNavigate" in src
    # The DELETE branch must NOT redirect (turning off shouldn't celebrate)
    # — we check the structure puts the redirect inside the else branch.
    assert "Verificación activada" in src


def test_ecards_panel_redirects_to_celebration():
    """EcardsManagerPanel.toggleVerify must redirect to the celebration
    when the user activates verification."""
    src = _read(ECARDS_PANEL_PATH)
    assert "celebrate=verified" in src
    assert "Verificación activa" in src


def test_button_renamed_publish_not_download():
    """V16.1 regression — the button label/test-id changed from
    'Descargar para Story' to 'Publicar en Story' (Web Share API)."""
    src = _read(SHARE_CARD_PATH)
    assert "Publicar en Story" in src
    assert "Descargar para Story" not in src
    assert 'data-testid="share-link-story-publish"' in src
    assert 'data-testid="share-link-story-download"' not in src
