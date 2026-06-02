import { startRecommendationSkillGapWorkflow } from "@/app/lib/recommendation-agent";
import {
  getLearnerSkillProfile,
  upsertLearnerSkillProfile,
} from "@/app/lib/recommendation-skill-profile-db";

const DEFAULT_HINDSIGHT_URL =
  process.env.HINDSIGHT_URL || process.env.HINDSIGHT_API_URL || "http://127.0.0.1:8888";
const DEFAULT_HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";
const PROFILE_TYPE = "skill_gap_radar";
const AGENT_PREFIX = "[Agno Recommendation Agent]";
const REFRESH_STATE_KEY = "__recommendationSkillGapRefreshState";

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function buildUserCourseBankPrefix(tenantId: string, userId: string) {
  return `tenant:${tenantId}:user:${userId}:course:`;
}

function buildSkillProfileBankId(tenantId: string, userId: string) {
  return `tenant:${tenantId}:user:${userId}:skill-profile`;
}

function getRefreshState() {
  const globalScope = globalThis as typeof globalThis & {
    [REFRESH_STATE_KEY]?: Set<string>;
  };

  if (!globalScope[REFRESH_STATE_KEY]) {
    globalScope[REFRESH_STATE_KEY] = new Set<string>();
  }

  return globalScope[REFRESH_STATE_KEY];
}

function hindsightHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (DEFAULT_HINDSIGHT_API_KEY) {
    headers.Authorization = `Bearer ${DEFAULT_HINDSIGHT_API_KEY}`;
  }
  return headers;
}

type SourceFreshness = {
  latestSourceTimestamp: string | null;
  learnerCourseBankCount: number;
};

async function getLearnerSourceFreshness(tenantId: string, userId: string): Promise<SourceFreshness> {
  console.log(
    `${AGENT_PREFIX} skill-gap freshness check started. tenantId=${tenantId} userId=${userId}`,
  );
  const listResponse = await fetch(`${DEFAULT_HINDSIGHT_URL}/v1/default/banks`, {
    cache: "no-store",
    headers: hindsightHeaders(),
  });
  const listPayload = (await listResponse.json().catch(() => null)) as
    | { banks?: Array<Record<string, unknown>> }
    | null;

  if (!listResponse.ok) {
    throw new Error("Failed to list Hindsight banks for freshness check.");
  }

  const prefix = buildUserCourseBankPrefix(tenantId, userId);
  const bankIds = (listPayload?.banks || [])
    .map((bank) => cleanText(bank.bank_id))
    .filter((bankId) => bankId.startsWith(prefix));

  let latestSourceTimestamp: string | null = null;

  for (const bankId of bankIds) {
    console.log(
      `${AGENT_PREFIX} skill-gap freshness checking bank. tenantId=${tenantId} userId=${userId} bankId=${bankId}`,
    );
    const response = await fetch(
      `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/memories/list?limit=1&offset=0`,
      {
        cache: "no-store",
        headers: hindsightHeaders(),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { items?: Array<Record<string, unknown>> }
      | null;

    if (!response.ok) {
      continue;
    }

    const firstItem = payload?.items?.[0];
    const candidate =
      cleanText(firstItem?.updated_at) ||
      cleanText(firstItem?.created_at) ||
      cleanText(firstItem?.event_at) ||
      cleanText(firstItem?.timestamp);

    if (!candidate) {
      continue;
    }

    if (!latestSourceTimestamp || new Date(candidate).getTime() > new Date(latestSourceTimestamp).getTime()) {
      latestSourceTimestamp = candidate;
    }
  }

  return {
    latestSourceTimestamp,
    learnerCourseBankCount: bankIds.length,
  };
}

function shouldRefreshCache(cachedProfile: { updated_at: string } | null, freshness: SourceFreshness) {
  if (!cachedProfile) {
    return true;
  }

  if (!freshness.latestSourceTimestamp) {
    return false;
  }

  return new Date(freshness.latestSourceTimestamp).getTime() > new Date(cachedProfile.updated_at).getTime();
}

function hasCachedSkillProfilePayload(cachedProfile: { profile_payload?: Record<string, unknown> } | null) {
  return Boolean(cachedProfile?.profile_payload && Object.keys(cachedProfile.profile_payload).length > 0);
}

async function retainSkillProfileSnapshot(params: {
  tenantId: string;
  userId: string;
  result: Record<string, unknown>;
}) {
  const bankId =
    cleanText(params.result.skillProfileBankId) || buildSkillProfileBankId(params.tenantId, params.userId);

  const payload = {
    items: [
      {
        document_id: `skill_gap_radar:${params.userId}`,
        update_mode: "replace",
        context: "learner skill-gap radar snapshot",
        content: JSON.stringify(
          {
            skillRadar: params.result.crossCourseSynthesis,
            mappedCourseDomains: params.result.mappedCourseDomains,
            generatedAt: params.result.startedAt,
          },
          null,
          2,
        ),
        metadata: {
          tenantId: params.tenantId,
          userId: params.userId,
          profileType: PROFILE_TYPE,
          generatedAt: params.result.startedAt,
        },
        tags: [
          `tenant:${params.tenantId}`,
          `user:${params.userId}`,
          "profile:skill_gap_radar",
          "source:recommendation_agent",
        ],
      },
    ],
    async: true,
  };

  const response = await fetch(
    `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
    {
      method: "POST",
      cache: "no-store",
      headers: hindsightHeaders(),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Failed to retain skill-profile snapshot in Hindsight. status=${response.status}${
        details ? ` body=${details.slice(0, 500)}` : ""
      }`,
    );
  }
}

function launchBackgroundSkillGapRefresh(params: {
  tenantId: string;
  userId: string;
  pagePath: string;
}) {
  const refreshKey = `${params.tenantId}:${params.userId}:${PROFILE_TYPE}`;
  const refreshState = getRefreshState();
  if (refreshState.has(refreshKey)) {
    console.log(`${AGENT_PREFIX} skill-gap background refresh already running. key=${refreshKey}`);
    return;
  }

  refreshState.add(refreshKey);
  console.log(
    `${AGENT_PREFIX} skill-gap background refresh scheduled. tenantId=${params.tenantId} userId=${params.userId} pagePath=${params.pagePath} key=${refreshKey}`,
  );
  void (async () => {
    try {
      console.log(
        `${AGENT_PREFIX} skill-gap background refresh started. tenantId=${params.tenantId} userId=${params.userId} pagePath=${params.pagePath}`,
      );

      const result = await startRecommendationSkillGapWorkflow({
        tenantId: params.tenantId,
        userId: params.userId,
        source: "recommendations-page",
        pagePath: params.pagePath,
      });

      await upsertLearnerSkillProfile({
        tenantId: params.tenantId,
        userId: params.userId,
        profileType: PROFILE_TYPE,
        status: result.status || "started",
        bankId: result.skillProfileBankId || buildSkillProfileBankId(params.tenantId, params.userId),
        source: result.source || "recommendations-page",
        payload: result,
      });

      try {
        await retainSkillProfileSnapshot({
          tenantId: params.tenantId,
          userId: params.userId,
          result,
        });
      } catch (retentionError) {
        console.warn(
          `${AGENT_PREFIX} skill-gap Hindsight snapshot retention skipped after database cache update: ${
            retentionError instanceof Error ? retentionError.message : "Unknown error"
          }`,
        );
      }

      console.log(
        `${AGENT_PREFIX} skill-gap background refresh completed. tenantId=${params.tenantId} userId=${params.userId} status=${result.status || "unknown"} updatedAt=${result.startedAt || "n/a"}`,
      );
    } catch (error) {
      console.error(
        `${AGENT_PREFIX} skill-gap background refresh failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      refreshState.delete(refreshKey);
    }
  })();
}

function decodeJwtClaims(token: string | null): { tenantId?: string | null; sub?: string | null } | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as { tenantId?: string | null; sub?: string | null };
  } catch {
    return null;
  }
}

function getTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function POST(request: Request) {
  const token = getTokenFromRequest(request);
  const claims = decodeJwtClaims(token);
  const body = await request.json().catch(() => ({}));

  const tenantId =
    typeof body?.tenantId === "string" ? body.tenantId : claims?.tenantId || null;
  const userId =
    typeof body?.userId === "string" ? body.userId : claims?.sub || null;

  if (!tenantId || !userId) {
    return Response.json(
      {
        success: false,
        workflowName: "recommendation-agent",
        action: "skill-gap-start-route-rejected",
        error: "tenantId and userId are required.",
      },
      { status: 400 },
    );
  }

  try {
    console.log(
      `${AGENT_PREFIX} skill-gap/start request received. tenantId=${tenantId} userId=${userId} pagePath=${typeof body?.pagePath === "string" ? body.pagePath : "/recommendations/skill-gap"}`,
    );
    const pagePath =
      typeof body?.pagePath === "string" ? body.pagePath : "/recommendations/skill-gap";
    const cachedProfile = await getLearnerSkillProfile({
      tenantId,
      userId,
      profileType: PROFILE_TYPE,
    });
    const freshness = await getLearnerSourceFreshness(tenantId, userId);
    const cachedPayloadPresent = hasCachedSkillProfilePayload(cachedProfile);
    const refreshNeeded = shouldRefreshCache(cachedProfile, freshness) || !cachedPayloadPresent;
    console.log(
      `${AGENT_PREFIX} skill-gap cache decision. tenantId=${tenantId} userId=${userId} cachedPresent=${cachedPayloadPresent} learnerCourseBanks=${freshness.learnerCourseBankCount} latestSourceTimestamp=${freshness.latestSourceTimestamp || "none"} refreshNeeded=${refreshNeeded}`,
    );

    if (refreshNeeded) {
      console.log(
        `${AGENT_PREFIX} Skill-gap cache is empty or stale. Background refresh will run. tenantId=${tenantId} userId=${userId}`,
      );
      launchBackgroundSkillGapRefresh({
        tenantId,
        userId,
        pagePath,
      });
    } else {
      console.log(
        `${AGENT_PREFIX} skill-gap cache is fresh. Returning cached skill-gap profile. tenantId=${tenantId} userId=${userId}`,
      );
    }

    if (cachedPayloadPresent) {
      console.log(
        `${AGENT_PREFIX} Returning cached skill-gap profile payload. cached=${Boolean(cachedProfile?.profile_payload)} refreshStarted=${refreshNeeded} learnerCourseBanks=${freshness.learnerCourseBankCount}`,
      );
      const responseBody = {
        ...(cachedProfile.profile_payload as Record<string, unknown>),
        databaseRecordId: cachedProfile.id,
        cached: true,
        refreshStarted: refreshNeeded,
        cacheStatus: refreshNeeded ? "stale_revalidating" : "fresh",
        sourceFreshness: freshness,
        lastComputedAt: cachedProfile.updated_at,
      };
      console.log(
        `${AGENT_PREFIX} skill-gap response ready. tenantId=${tenantId} userId=${userId} cached=${responseBody.cached} cacheStatus=${responseBody.cacheStatus} learnerCourseBanks=${freshness.learnerCourseBankCount}`,
      );
      return Response.json(responseBody, { status: 200 });
    }

    const responseBody = {
      success: true,
      workflowName: "recommendation-agent",
      action: "skill-gap-cache-miss-background-started",
      status: "pending",
      message: "No cached skill-gap profile was found. Background generation has started.",
      tenantId,
      userId,
      skillProfileBankId: buildSkillProfileBankId(tenantId, userId),
      cached: false,
      refreshStarted: true,
      cacheStatus: "missing_revalidating",
      sourceFreshness: freshness,
    };
    console.log(
      `${AGENT_PREFIX} skill-gap response ready. tenantId=${tenantId} userId=${userId} cached=${responseBody.cached} cacheStatus=${responseBody.cacheStatus} learnerCourseBanks=${freshness.learnerCourseBankCount}`,
    );
    return Response.json(responseBody, { status: 200 });
  } catch (error) {
    console.error(
      `${AGENT_PREFIX} skill-gap/start route failed. tenantId=${tenantId || "unknown"} userId=${userId || "unknown"}`,
      error,
    );
    return Response.json(
      {
        success: false,
        workflowName: "recommendation-agent",
        action: "skill-gap-start-route-failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
