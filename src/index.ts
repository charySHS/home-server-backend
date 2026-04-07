import "./env.js"; // must be first — loads .env before any module reads process.env
import createApp from "./app.js";
import { logger } from "./logger/Logger.js";

const app = await createApp();

const PORT = Number(process.env.PORT) || 3000;

await app.listen({ port: PORT, host: "0.0.0.0" })
    .then(() => {
        console.log(`Server running on http://localhost:${PORT}`);
        logger.info("server_start", { port: PORT });
    })
    .catch(err => {
        logger.error("server_start_failed", { message: (err as Error).message });
        app.log.error(err);
        process.exit(1);
    });
