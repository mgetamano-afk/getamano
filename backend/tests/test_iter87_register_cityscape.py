"""
Iteration 87 — Register flow + Cityscape backdrop + mobile overflow lock.

Catches three regressions called out by the user:

  · BUG-A: `/register` and `/registro` used to render LoginPage, so a
    brand-new visitor who tapped "Create one here" never reached a real
    signup form. Verify the dedicated Register component now mounts.
  · BUG-B: Entry screens (Splash, Slides, Login, Register) need to
    include the CSS cityscape backdrop. Lock the import statement.
  · BUG-C: The Register card overflowed the viewport on small phones.
    The new layout caps width at `max-w-md` (28rem) and pads with 16px.
    We can't measure the rendered DOM here, but we lock the layout
    classes that prevent overflow.
"""
import os


def _read(rel_path: str) -> str:
    full = os.path.join(os.path.dirname(__file__), "..", "..", rel_path)
    with open(full, encoding="utf-8") as f:
        return f.read()


def test_register_route_renders_real_register_component():
    """App.js must mount Register (not LoginPage) at /register and /registro."""
    src = _read("frontend/src/App.js")
    assert 'import Register from "./pages/Register"' in src, (
        "Section 87 regression: Register component must be imported in App.js"
    )
    assert '<Route path="/register" element={<Register />}' in src, (
        "Section 87 regression: /register must mount Register (was LoginPage)"
    )
    assert '<Route path="/registro" element={<Register />}' in src, (
        "Section 87 regression: /registro must mount Register"
    )
    # And the LoginPage alias must be removed for /register
    assert '<Route path="/register" element={<LoginPage />}' not in src
    assert '<Route path="/registro" element={<LoginPage />}' not in src


def test_register_component_has_create_form():
    """The Register page must expose a submit button + name/email/password inputs."""
    src = _read("frontend/src/pages/Register.jsx")
    for needle in (
        'data-testid="register-submit"',
        'data-testid="register-name-input"',
        'data-testid="register-email-input"',
        'data-testid="register-password-input"',
        'testid="register-role-client"',
        'testid="register-role-provider"',
    ):
        assert needle in src, f"Section 87 regression: missing {needle}"
    # And it must NOT use orange/teal/green Tailwind tokens
    assert "border-orange-200" not in src, "Section 87 regression: orange palette leaked into Register"
    assert "text-orange-600" not in src, "Section 87 regression: orange leaked into Register"
    assert "border-green-200" not in src, "Section 87 regression: green leaked into Register"


def test_cityscape_backdrop_is_mounted_on_entry_screens():
    """Section 87 — Splash, Slides, Login and Register all import the
    cityscape backdrop so the user sees CSS buildings on every entry
    surface."""
    for rel in (
        "frontend/src/components/onboarding/OnboardingSplash.jsx",
        "frontend/src/components/onboarding/OnboardingSlides.jsx",
        "frontend/src/components/onboarding/OnboardingLogin.jsx",
        "frontend/src/pages/Register.jsx",
    ):
        src = _read(rel)
        assert "CityscapeBackdrop" in src, (
            f"Section 87 regression: {rel} must import + render CityscapeBackdrop"
        )


def test_cityscape_buildings_have_solid_background_color():
    """Section 87 BUG fix — the .gtm-bldg rule must use background-color
    (NOT include the color inside background-image which is invalid CSS
    and made buildings invisible). Locks the painted silhouettes."""
    src = _read("frontend/src/components/CityscapeBackdrop.jsx")
    assert "background-color: var(--bldg-bg" in src, (
        "Section 87 regression: gtm-bldg must use `background-color` so the "
        "building silhouette actually paints. The previous "
        "`background-image: ..., var(--bldg-bg)` was invalid CSS."
    )


def test_register_layout_caps_overflow_on_mobile():
    """The Register page must avoid horizontal scroll on small phones.
    We lock the structural classes that enforce this."""
    src = _read("frontend/src/pages/Register.jsx")
    assert 'minHeight: "100dvh"' in src, (
        "Section 87 regression: Register must use 100dvh (mobile-safe)"
    )
    # Card width is capped to keep the form inside the viewport
    assert "max-w-md" in src
    # Page is the OUTER fixed container — the backdrop renders fixed inset-0
    # so any wide background never widens the document scroll area.
    assert 'pointer-events-none fixed inset-0 overflow-hidden' in _read(
        "frontend/src/components/CityscapeBackdrop.jsx"
    ), "Section 87 regression: cityscape must be fixed+clipped"
