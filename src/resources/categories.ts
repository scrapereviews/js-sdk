import type {
  CategoriesResponse,
  CategoryCompaniesOptions,
  CategoryCompaniesResponse,
} from "../types.js";
import { segment, type RequestFn } from "./shared.js";

export class CategoriesAPI {
  constructor(private readonly request: RequestFn) {}

  /** All Trustpilot categories with their subcategories. Cost: 1 credit. */
  async list(): Promise<CategoriesResponse> {
    return this.request("/v1/categories") as Promise<CategoriesResponse>;
  }

  /**
   * Company ranking of a category in a country (ISO 3166-1 alpha-2, e.g. `"IT"`).
   * Cost: 1 credit per 10 companies (min 1).
   */
  async companies(
    categoryId: string,
    country: string,
    options: CategoryCompaniesOptions = {}
  ): Promise<CategoryCompaniesResponse> {
    return this.request(`/v1/categories/${segment(categoryId)}/companies`, {
      country,
      sort: options.sort ?? "relevant",
      min_trust_score: options.minTrustScore,
      location: options.location,
      limit: options.limit ?? 20,
      cursor: options.cursor,
    }) as Promise<CategoryCompaniesResponse>;
  }
}
