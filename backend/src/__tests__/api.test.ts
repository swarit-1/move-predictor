import request from "supertest";
import { createApp } from "../app";

const app = createApp();

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("GET /api/health", () => {
  it("returns a structured health report", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(["healthy", "degraded", "unhealthy"]).toContain(res.body.status);
    expect(res.body.services).toHaveProperty("ml.status");
    expect(res.body.services).toHaveProperty("redis.status");
    expect(typeof res.body.uptime_seconds).toBe("number");
  }, 15000);
});

describe("POST /api/predict validation", () => {
  it("rejects a missing fen", async () => {
    const res = await request(app).post("/api/predict").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects a malformed fen", async () => {
    const res = await request(app)
      .post("/api/predict")
      .send({ fen: "not-a-real-fen with words" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("rejects a fen with the wrong number of ranks", async () => {
    const res = await request(app)
      .post("/api/predict")
      .send({ fen: "8/8/8/8/8/8/8 w - - 0 1" }); // 7 ranks
    expect(res.status).toBe(400);
  });
});

describe("simulation sessions", () => {
  it("starts a session and reports its state", async () => {
    const start = await request(app)
      .post("/api/simulate/start")
      .send({ black_rating: 1500 });
    expect(start.status).toBe(200);
    expect(start.body.success).toBe(true);
    const sessionId = start.body.data.session_id;
    expect(sessionId).toBeTruthy();

    const state = await request(app).get(`/api/simulate/${sessionId}`);
    expect(state.status).toBe(200);
    expect(state.body.data.fen).toBe(START_FEN);
    expect(state.body.data.turn).toBe("white");
  });

  it("404s for an unknown session", async () => {
    const res = await request(app).get("/api/simulate/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("rejects an illegal move", async () => {
    const start = await request(app)
      .post("/api/simulate/start")
      .send({ black_rating: 1200 });
    const sessionId = start.body.data.session_id;

    const res = await request(app)
      .post(`/api/simulate/${sessionId}/move`)
      .send({ move: "e2e5" }); // illegal pawn jump
    expect(res.status).toBe(400);
  });

  it("rejects invalid style overrides", async () => {
    const res = await request(app)
      .post("/api/simulate/start")
      .send({ style_overrides: { aggression: "very" } });
    expect(res.status).toBe(400);
  });
});
