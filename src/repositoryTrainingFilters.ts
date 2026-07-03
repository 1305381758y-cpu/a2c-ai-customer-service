export interface SqlWhere {
  where: string;
  params: Array<string | number>;
}

export function buildTrainingSampleWhere(filters: {
  merchantId?: string;
  countryId?: string;
  language?: string;
  intent?: string;
  stage?: string;
  enabled?: boolean;
} = {}): SqlWhere {
  const query = createWhereBuilder();
  query.add("merchant_id", filters.merchantId);
  query.add("country_id", filters.countryId);
  query.add("language", filters.language);
  query.add("intent", filters.intent);
  query.add("stage", filters.stage);
  query.addBoolean("enabled", filters.enabled);
  return query.build();
}

export function buildKnowledgeItemWhere(filters: {
  merchantId?: string;
  countryId?: string;
  type?: string;
  enabled?: boolean;
} = {}): SqlWhere {
  const query = createWhereBuilder();
  query.add("merchant_id", filters.merchantId);
  query.add("country_id", filters.countryId);
  query.add("type", filters.type);
  query.addBoolean("enabled", filters.enabled);
  return query.build();
}

export function buildTrainingMaterialWhere(filters: {
  merchantId?: string;
  countryId?: string;
  sourceType?: string;
  status?: string;
} = {}): SqlWhere {
  const query = createWhereBuilder();
  query.add("tm.merchant_id", filters.merchantId);
  query.add("tm.country_id", filters.countryId);
  query.add("tm.source_type", filters.sourceType);
  query.add("tm.status", filters.status);
  return query.build();
}

export function clampTrainingLimit(limit: number | undefined, fallback: number, max: number): number {
  return Math.min(Math.max(limit ?? fallback, 1), max);
}

function createWhereBuilder(): {
  add: (column: string, value: string | undefined) => void;
  addBoolean: (column: string, value: boolean | undefined) => void;
  build: () => SqlWhere;
} {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  return {
    add(column, value) {
      if (!value) return;
      clauses.push(`${column} = ?`);
      params.push(value);
    },
    addBoolean(column, value) {
      if (typeof value !== "boolean") return;
      clauses.push(`${column} = ?`);
      params.push(value ? 1 : 0);
    },
    build() {
      return {
        where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
        params
      };
    }
  };
}
