import { createApp } from "./app";
import { config, logger } from "./config";

// PRD §3.9: single source of truth for the port — config.port already
// parses BACKEND_PORT with the same default.
const PORT = config.port;

const app = createApp();

app.listen(PORT, () => {
  logger.info(`Backend API gateway running on port ${PORT}`);
});

export default app;
