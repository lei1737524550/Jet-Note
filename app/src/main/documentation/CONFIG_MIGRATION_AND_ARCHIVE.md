# config.json migration and archive policy

`assets/config.json` defines the schema shipped by the currently installed APK. The runtime copy is user data.

On startup and whenever runtime config is saved, `RuntimeConfigStore` recursively projects user values onto the current bundled schema:

- A field that still exists in the APK keeps the user's current value.
- A field newly added by the APK is inserted with the APK's bundled default value.
- A field removed by the APK is removed from the effective runtime config.
- Nested JSON objects follow the same rule recursively.
- Arrays and scalar fields are treated as complete values and are preserved when their field still exists.

This prevents an APK update from wiping user tuning while still allowing the application to evolve its configuration schema.

Jet Note `.jnote` archives may contain `data/config.json`. It is covered by the archive checksum manifest. On import, the archived config is validated and then passed through the same current-schema merge before it is persisted. This means importing an older backup cannot resurrect fields that the installed APK has removed, and fields introduced by the installed APK are retained with their current defaults.
