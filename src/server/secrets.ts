import { parseDraw, parseParticipants } from "../core/yaml";
import { type ParticipantDraw } from "../core/types";

export interface Secrets {
  participants: string[];
  draws: ParticipantDraw[];
  providerApiKey: string | null;
}

export function loadSecrets(env: NodeJS.ProcessEnv): Secrets {
  const teamsYaml = env.TEAMS_YAML;
  const drawYaml = env.DRAW_YAML;

  return {
    participants: teamsYaml ? parseParticipants(teamsYaml) : [],
    draws: drawYaml ? parseDraw(drawYaml) : [],
    providerApiKey: env.PROVIDER_API_KEY ?? null,
  };
}
