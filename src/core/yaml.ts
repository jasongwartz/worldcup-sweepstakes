import yaml from "js-yaml";
import {
  DrawYamlSchema,
  ParticipantsYamlSchema,
} from "./schemas.ts";
import { type ParticipantDraw } from "./types.ts";

export function parseParticipants(yamlText: string): string[] {
  const parsed: unknown = yaml.load(yamlText);
  return ParticipantsYamlSchema.parse(parsed).teams;
}

export function parseDraw(yamlText: string): ParticipantDraw[] {
  const parsed: unknown = yaml.load(yamlText);
  const { assignments } = DrawYamlSchema.parse(parsed);
  return Object.entries(assignments).map(([participant, teams]) => ({
    participant,
    teams,
  }));
}

export function stringifyDraw(
  assignments: Record<string, string[]>,
  meta: { seed?: string; drawnAt?: string } = {},
): string {
  return yaml.dump(
    {
      ...(meta.seed !== undefined ? { seed: meta.seed } : {}),
      ...(meta.drawnAt !== undefined ? { drawnAt: meta.drawnAt } : {}),
      assignments,
    },
    { lineWidth: 100, noRefs: true, sortKeys: false },
  );
}
