# Unified Post Surface

Home has one Post surface identity: `.post-surface`.

Roles are expressed with `data-post-role`:

- `main`: a published Post in Main Posts.
- `top`: the same published Post while its state is `super_star`.
- `composer`: the creation-entry Post. Its controls are additive role behavior.

A role may add layout and controls, but must not introduce a second Post identity model. New movement code should reason about Post identity (`data-post-id`) plus role, rather than treating Top Post and Main Post as unrelated component species.

The composer intentionally has larger behavioral differences, but those differences remain role-specific additions on the common Post surface.
