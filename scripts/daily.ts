// Daily job from the command line (cron): npm run daily
import { runDailyJob } from "../src/lib/generator";

runDailyJob()
  .then((r) => { console.log(new Date().toISOString(), "daily job", JSON.stringify(r)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
