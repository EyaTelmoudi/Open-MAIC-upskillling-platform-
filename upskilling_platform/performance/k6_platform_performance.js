import http from "k6/http";
import ws from "k6/ws";
import { check, group, sleep } from "k6";

const MODE = __ENV.MODE || "api";
const VUS = Number(__ENV.VUS || "5");
const DURATION = __ENV.DURATION || "30s";
const ITERATIONS = Number(__ENV.ITERATIONS || "10");

const IDENTITY_URL = __ENV.IDENTITY_URL || "http://host.docker.internal:8001";
const LEARNING_URL = __ENV.LEARNING_URL || "http://host.docker.internal:8002";
const NOTIFICATIONS_WS_URL =
  __ENV.NOTIFICATIONS_WS_URL || "ws://host.docker.internal:8004";
const RECOMMENDATION_AGENT_URL =
  __ENV.RECOMMENDATION_AGENT_URL || "http://host.docker.internal:8016";
const SOLO_CHALLENGE_AGENT_URL =
  __ENV.SOLO_CHALLENGE_AGENT_URL || "http://host.docker.internal:8013";

const TENANT = __ENV.TENANT || "3s";
const EMAIL = __ENV.EMAIL || "user2@3s.com.tn";
const PASSWORD = __ENV.PASSWORD || "user2@2026";
const USER_ID = __ENV.USER_ID || "3f115869-506e-4821-94d9-500bcc5ecefa";
const TENANT_ID = __ENV.TENANT_ID || "9f01c103-b0b0-4e56-a10d-3196cb5320e3";
const COURSE_ID =
  __ENV.COURSE_ID || "d3ae6510-c71d-4a3d-adef-b73b275d6513";
const LESSON_ID =
  __ENV.LESSON_ID || "759bdeb6-2981-4a81-9bf2-5f01636f0980";

const commonThresholds = {
  http_req_failed: ["rate<0.05"],
  http_req_duration: ["p(95)<2000"],
};

const summaryTrendStats = ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"];

const modeOptions = {
  api: {
    summaryTrendStats,
    scenarios: {
      api_responsiveness: {
        executor: "constant-vus",
        vus: VUS,
        duration: DURATION,
        exec: "apiScenario",
      },
    },
    thresholds: commonThresholds,
  },
  load: {
    summaryTrendStats,
    scenarios: {
      load_capacity: {
        executor: "ramping-vus",
        stages: [
          { duration: "15s", target: 5 },
          { duration: "20s", target: 10 },
          { duration: "20s", target: 25 },
          { duration: "10s", target: 0 },
        ],
        exec: "apiScenario",
      },
    },
    thresholds: commonThresholds,
  },
  progress: {
    summaryTrendStats,
    scenarios: {
      progress_gamification: {
        executor: "shared-iterations",
        vus: VUS,
        iterations: ITERATIONS,
        exec: "progressScenario",
      },
    },
    thresholds: commonThresholds,
  },
  notifications: {
    summaryTrendStats,
    scenarios: {
      notification_websocket: {
        executor: "constant-vus",
        vus: VUS,
        duration: DURATION,
        exec: "notificationScenario",
      },
    },
    thresholds: {
      checks: ["rate>0.95"],
    },
  },
  agents: {
    summaryTrendStats,
    scenarios: {
      ai_agents: {
        executor: "shared-iterations",
        vus: VUS,
        iterations: ITERATIONS,
        exec: "agentScenario",
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.20"],
      http_req_duration: ["p(95)<15000"],
    },
  },
};

export const options = modeOptions[MODE] || modeOptions.api;

function login() {
  const response = http.post(
    `${IDENTITY_URL}/api/v1/auth/login/local?tenant=${TENANT}`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" }, tags: { endpoint: "login" } },
  );

  check(response, {
    "login status is 200": (res) => res.status === 200,
    "login returns access token": (res) => Boolean(res.json("access_token")),
  });

  return response.json("access_token");
}

function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

export function apiScenario() {
  const token = login();
  const auth = authHeaders(token);

  group("API response time", () => {
    check(
      http.get(`${IDENTITY_URL}/api/v1/identity/users/me`, {
        ...auth,
        tags: { endpoint: "users_me" },
      }),
      { "profile is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/courses?page=1&page_size=10`, {
        ...auth,
        tags: { endpoint: "courses_catalog" },
      }),
      { "courses catalog is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/courses/${COURSE_ID}`, {
        ...auth,
        tags: { endpoint: "course_detail" },
      }),
      { "course detail is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/courses/${COURSE_ID}/curriculum`, {
        ...auth,
        tags: { endpoint: "course_curriculum" },
      }),
      { "curriculum is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/enrollments/?user_id=${USER_ID}`, {
        ...auth,
        tags: { endpoint: "enrollments" },
      }),
      { "enrollments is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/progress/?user_id=${USER_ID}`, {
        ...auth,
        tags: { endpoint: "progress" },
      }),
      { "progress is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/gamification/profile`, {
        ...auth,
        tags: { endpoint: "gamification_profile" },
      }),
      { "gamification profile is 200": (res) => res.status === 200 },
    );
  });

  sleep(1);
}

export function progressScenario() {
  const token = login();
  const auth = authHeaders(token);

  group("Progression and gamification", () => {
    check(
      http.post(
        `${LEARNING_URL}/api/v1/progress/${LESSON_ID}/complete`,
        JSON.stringify({ user_id: USER_ID }),
        { ...auth, tags: { endpoint: "lesson_complete" } },
      ),
      { "lesson completion is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/gamification/profile`, {
        ...auth,
        tags: { endpoint: "gamification_profile_after_completion" },
      }),
      { "gamification after completion is 200": (res) => res.status === 200 },
    );

    check(
      http.get(`${LEARNING_URL}/api/v1/gamification/leaderboard/me`, {
        ...auth,
        tags: { endpoint: "leaderboard_me" },
      }),
      { "rank is 200": (res) => res.status === 200 },
    );
  });

  sleep(1);
}

export function notificationScenario() {
  const token = login();
  const url = `${NOTIFICATIONS_WS_URL}/ws/${USER_ID}?token=${token}`;

  const response = ws.connect(url, {}, (socket) => {
    socket.setTimeout(() => {
      socket.close();
    }, 1000);
  });

  check(response, {
    "notification websocket connected": (res) => res && res.status === 101,
  });

  sleep(1);
}

export function agentScenario() {
  group("AI agents", () => {
    check(
      http.get(`${RECOMMENDATION_AGENT_URL}/health`, {
        tags: { endpoint: "recommendation_agent_health" },
      }),
      { "recommendation agent health is 200": (res) => res.status === 200 },
    );

    check(
      http.post(
        `${RECOMMENDATION_AGENT_URL}/v1/recommendation/feed`,
        JSON.stringify({
          tenantId: TENANT_ID,
          userId: USER_ID,
          source: "recommendations-page",
          pagePath: "/recommendations",
          skillRadar: [
            {
              skill_domain: "Web development",
              status: "in_progress",
              evidence_summary: ["Learner is enrolled in a PHP basics course."],
            },
          ],
          courses: [
            {
              id: COURSE_ID,
              title: "PHP Basics for Beginners",
              description: "AI-generated course",
              category: "AI Generated",
              difficulty: "Intermediate",
              isPublished: true,
            },
          ],
          enrollments: [{ courseId: COURSE_ID, status: "in_progress" }],
          learnerContexts: [
            {
              courseId: COURSE_ID,
              courseTitle: "PHP Basics for Beginners",
              currentLessonId: LESSON_ID,
              currentLessonTitle: "Setting Up the Development Environment",
              progressPercent: 20,
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          tags: { endpoint: "recommendation_feed" },
          timeout: "30s",
        },
      ),
      { "recommendation feed responded": (res) => res.status >= 200 && res.status < 500 },
    );

    check(
      http.get(`${SOLO_CHALLENGE_AGENT_URL}/health`, {
        tags: { endpoint: "solo_challenge_agent_health" },
      }),
      { "solo challenge agent health is 200": (res) => res.status === 200 },
    );
  });

  sleep(1);
}
