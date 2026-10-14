import type { BaseUnit } from '@/domain/quantity';
import type { DraftLine } from '@/domain/order-draft';
import type { Envelope, Instant } from './api';
import type { LoadOptions } from './read-model';

export interface Product {
  readonly productID: string;
  readonly name: string;
  readonly baseUnit: BaseUnit;
}
export interface Products {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly items: readonly Product[];
}
export interface Ingredient {
  readonly productID: string;
  readonly quantity: string;
  readonly baseUnit: BaseUnit;
}
export interface Dish {
  readonly dishID: string;
  readonly name: string;
  readonly ingredients: readonly Ingredient[];
}
export interface DishCatalog {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly items: readonly Dish[];
}
export interface DishDetails {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly dish: Dish;
}
export type CatalogKind = 'product' | 'dish';
export interface Suggestion {
  readonly kind: CatalogKind;
  readonly suggestedID: string;
}
export interface MenuDish {
  readonly dishID: string;
  readonly name: string;
}
export interface Menu {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly dishes: readonly MenuDish[];
}
export interface Deficit {
  readonly productID: string;
  readonly requiredQuantity: string;
  readonly availableQuantity: string;
}
export interface StopListDish {
  readonly dishID: string;
  readonly name: string;
  readonly deficits: readonly Deficit[];
}
export interface StopList {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly dishes: readonly StopListDish[];
}
export interface RecommendationReason {
  readonly productID: string;
  readonly productName: string;
  readonly batchID: string;
  readonly quantityPerPortion: string;
  readonly baseUnit: BaseUnit;
  readonly expiresAt: Instant;
}
export interface Recommendation {
  readonly dishID: string;
  readonly dishName: string;
  readonly priorityExpiresAt: Instant;
  readonly reasons: readonly RecommendationReason[];
}
export interface Recommendations {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly items: readonly Recommendation[];
}
export interface Position {
  readonly lineNo: string;
  readonly dishID: string;
  readonly portions: string;
}
export interface Change {
  readonly lineNo: string;
  readonly dishID: string;
  readonly requestedPortions: string;
  readonly acceptedPortions: string;
  readonly deficits: readonly Deficit[];
}
export interface OrderProposal {
  readonly proposalID: string;
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly requestedPositions: readonly Position[];
  readonly acceptedPositions: readonly Position[];
  readonly changes: readonly Change[];
  readonly warehouseEpoch: string;
}
export interface Allocation {
  readonly productID: string;
  readonly batchID: string;
  readonly quantity: string;
}
export interface Order {
  readonly orderID: string;
  readonly proposalID: string;
  readonly acceptedPositions: readonly Position[];
  readonly allocations: readonly Allocation[];
  readonly placedAt: Instant;
}
export type ConfirmResult =
  | { readonly kind: 'OrderConfirmed'; readonly order: Order }
  | { readonly kind: 'RequiresConfirmation'; readonly proposal: OrderProposal }
  | { readonly kind: 'EmptyOrder' }
  | { readonly kind: 'ProposalSuperseded'; readonly supersededBy: string }
  | { readonly kind: 'ConfirmationPending' };
export interface RequestedPosition {
  readonly dishID: string;
  readonly portions: string;
}
export interface ProductInput {
  readonly productID: string;
  readonly name: string;
  readonly baseUnit: BaseUnit;
}
export interface DishInput {
  readonly dishID: string;
  readonly name: string;
  readonly ingredients: readonly Ingredient[];
}

// Reads of one restaurant. Each rejects with ApiError.
export interface RestaurantReads {
  products(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<Products>>;
  dishCatalog(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<DishCatalog>>;
  dish(
    restaurantID: string,
    dishID: string,
    options: LoadOptions,
  ): Promise<Envelope<DishDetails>>;
  suggestID(
    restaurantID: string,
    kind: CatalogKind,
    options: LoadOptions,
  ): Promise<Envelope<Suggestion>>;
  servingProducts(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<Products>>;
  menu(restaurantID: string, options: LoadOptions): Promise<Envelope<Menu>>;
  stopList(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<StopList>>;
  recommendations(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<Recommendations>>;
}
export interface CatalogApi {
  registerProduct(
    restaurantID: string,
    input: ProductInput,
    commandID: string,
    epoch: string,
  ): Promise<Envelope<Product>>;
  defineDish(
    restaurantID: string,
    input: DishInput,
    commandID: string,
    epoch: string,
  ): Promise<Envelope<Dish>>;
}
export interface OrderApi {
  // Read by POST: evaluates without writing; needs the serving epoch.
  prepare(
    restaurantID: string,
    positions: readonly RequestedPosition[],
    epoch: string,
  ): Promise<Envelope<OrderProposal>>;
  confirm(
    restaurantID: string,
    proposalID: string,
    commandID: string,
    epoch: string,
  ): Promise<Envelope<ConfirmResult>>;
  resolve(
    restaurantID: string,
    attempt: {
      readonly commandID: string;
      readonly proposalID: string;
      readonly runtimeEpoch: string;
    },
  ): Promise<Envelope<ConfirmResult>>;
}

export type AttemptState = 'sent' | 'pending' | 'conflict';
// An order confirmation whose outcome is not settled yet; kept in the tab.
export interface StoredAttempt {
  readonly commandID: string;
  readonly proposalID: string;
  readonly runtimeEpoch: string;
  readonly proposal: OrderProposal;
  readonly startedAt: number;
  readonly state: AttemptState;
}
export interface StoredOrder {
  readonly userID: string;
  readonly restaurantID: string;
  readonly lines: readonly DraftLine[];
  readonly attempt: StoredAttempt | undefined;
}
export interface OrderStorage {
  load(userID: string, restaurantID: string): StoredOrder | undefined;
  save(record: StoredOrder): void;
  clear(userID: string, restaurantID: string): void;
  // Another user signed in or the user signed out.
  clearAll(): void;
}
