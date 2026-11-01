# SOURCE-SUPPORTED (code predicts; no dedicated experiment yet)
- H12 post-block onGround=false window alters vertical KB of the next unblocked hit depending on packet order.
- H13 airborne vertical KB equals the sim's v0y (≈ target's own vertical velocity).
- H14 server-side jump boost (+0.2·facing on any lift-off while sprinting) shifts the next KB by ≤0.05.
- H16 multiple clicks per tick share one raycast; all but the first hit i-frames.
- P6 vanilla-only: axe disables a shield raised inside the target's i-frame window; Paper skips it if amount ≤ lastHurt.
- Cobweb: KB on a webbed target reduced to one 25%/5% move then zeroed; first tick of entering a web is unslowed.
- H23 Paper knockback() at strength ≤0 still halves velocity (outside kit).
