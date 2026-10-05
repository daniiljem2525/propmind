// Разовый вход в Профи.ру: открывает видимый браузер, после входа профиль
// с сессией сохраняется на диск и дальше используется воркером.
import { interactiveLogin } from "./profi.mjs";
import { config } from "./config.mjs";

interactiveLogin().catch((err) => {
  console.error(err);
  process.exit(1);
});
