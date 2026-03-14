# HeadHunter Gifts Plugin for exteraGram

This plugin adds a "Gifts" integration for the HeadHunter platform directly into the exteraGram UI. 

**Note: Because adding custom Views (like a new tab) to `ProfileActivity` in Telegram's Android Java source is highly dependent on the exact layout structure, this plugin currently provides a two-pronged approach:**

1. **Profile Action Menu:** A safe, guaranteed "View HH Gifts" button in the 3-dot action menu of any user's profile.
2. **Method Hook Prototype:** A `MethodHook` on `ProfileActivity.createView` (or similar layout initialization methods) where you would inject your `FrameLayout` or `TextView` representing the new tab using `android_utils` and `hook_utils`.

## Installation

В exteraGram плагины — это просто текстовые файлы с Python кодом, у которых расширение изменено на `.plugin`. Встроенный движок читает их код напрямую.

1. Перекиньте файл `hh_gifts_plugin.plugin` из этой папки себе на телефон.
2. Сохраните его в папку, куда exteraGram скачивает плагины (или просто откройте его через exteraGram в Telegram).
3. Перейдите в **«Настройки exteraGram» -> «Плагины»** и убедитесь, что плагин включен.
4. Если вы захотите внести изменения в код, вы можете просто редактировать `hh_gifts_plugin.plugin` любым текстовым редактором, так как внутри это обычный Python-скрипт.

## Extending the Profile UI

To create a native-looking "Gifts" tab in `ProfileActivity` like the Telegram Premium badge:

1. **Inspect Telegram Source:** You will need to look at `org.telegram.ui.ProfileActivity` in the particular Telegram source tree exteraGram is built upon (usually standard Telegram for Android).
2. **Hook the Layout:** Hook the method where the `RecyclerView` or `LinearLayout` for the profile tabs is constructed. 
3. **Inject View:** Use Chaquopy to instantiate a `android.widget.TextView` or `android.widget.LinearLayout`, apply the same LayoutParams as the existing tabs (e.g., "Media", "Docs", "Links"), and use `.addView()` to append it.

## API Endpoint setup

The plugin expects your production server to be running at `hh.nerou.fun`.
By default, it uses: `https://hh.nerou.fun/api/v1/user/{user_id}`.

If you ever change your domain, open `hh_gifts_plugin.plugin` in any text editor and update the `API_BASE_URL` at the top:

```python
API_BASE_URL = "https://yournewdomain.com/api/v1/user/"
```
