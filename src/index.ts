import "./env.js"; // must be first — loads .env before any module reads process.env
import createApp from "./app.js";

const app = await createApp();

const PORT = Number(process.env.PORT) || 3000;

await app.listen({ port: PORT, host: "0.0.0.0" })
    .then(() => console.log(`Server running on http://localhost:${PORT}`))
    .catch(err => {
        app.log.error(err);
        process.exit(1);
    });
