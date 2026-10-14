import type { Envelope } from '@/application/api';
import type {
  CatalogApi,
  OrderApi,
  RestaurantReads,
} from '@/application/restaurant';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import {
  decodeDish,
  decodeDishCatalog,
  decodeDishDetails,
  decodeProduct,
  decodeProducts,
  decodeSuggestion,
} from './decode/catalog';
import { decoded } from './decode/common';
import { decodeEnvelope } from './decode/context';
import {
  decodeConfirmResult,
  decodeMenu,
  decodeOrderProposal,
  decodeRecommendations,
  decodeStopList,
} from './decode/serving';

const base = (restaurantID: string) =>
  `/api/v2/r/${encodeURIComponent(restaurantID)}`;
const query = (value: string) => encodeURIComponent(value);

// A decoder of {context, result}; a contract mismatch becomes Malformed with
// the given outcome.
function envelope<T>(
  result: (value: unknown, path: string) => T,
  outcome: 'unavailable' | 'unknown',
): (body: unknown) => Envelope<T> {
  return decoded((body) => decodeEnvelope(body, result), outcome);
}

const products = envelope(decodeProducts, 'unavailable');
const dishCatalog = envelope(decodeDishCatalog, 'unavailable');
const dishDetails = envelope(decodeDishDetails, 'unavailable');
const suggestion = envelope(decodeSuggestion, 'unavailable');
const menu = envelope(decodeMenu, 'unavailable');
const stopList = envelope(decodeStopList, 'unavailable');
const recommendations = envelope(decodeRecommendations, 'unavailable');
const proposal = envelope(decodeOrderProposal, 'unavailable');
const createdProduct = envelope(decodeProduct, 'unknown');
const createdDish = envelope(decodeDish, 'unknown');
const confirmed = envelope(decodeConfirmResult, 'unknown');
const resolved = envelope(decodeConfirmResult, 'unavailable');

export function createRestaurantReads(
  client: Pick<GatewayClient, 'read'>,
): RestaurantReads {
  return {
    async products(restaurantID, options) {
      return products(
        await client.read(`${base(restaurantID)}/warehouse/products`, options),
      );
    },
    async dishCatalog(restaurantID, options) {
      return dishCatalog(
        await client.read(
          `${base(restaurantID)}/warehouse/dish-catalog`,
          options,
        ),
      );
    },
    async dish(restaurantID, dishID, options) {
      return dishDetails(
        await client.read(
          `${base(restaurantID)}/warehouse/dish?dishID=${query(dishID)}`,
          options,
        ),
      );
    },
    async suggestID(restaurantID, kind, options) {
      return suggestion(
        await client.read(
          `${base(restaurantID)}/warehouse/id-suggestions?kind=${kind}`,
          options,
        ),
      );
    },
    async servingProducts(restaurantID, options) {
      return products(
        await client.read(`${base(restaurantID)}/serving/products`, options),
      );
    },
    async menu(restaurantID, options) {
      return menu(
        await client.read(`${base(restaurantID)}/serving/menu`, options),
      );
    },
    async stopList(restaurantID, options) {
      return stopList(
        await client.read(`${base(restaurantID)}/serving/stop-list`, options),
      );
    },
    async recommendations(restaurantID, options) {
      return recommendations(
        await client.read(
          `${base(restaurantID)}/serving/recommendations`,
          options,
        ),
      );
    },
  };
}

export function createCatalogApi(
  client: Pick<GatewayClient, 'send'>,
): CatalogApi {
  return {
    async registerProduct(
      restaurantID,
      { productID, name, baseUnit },
      commandID,
      epoch,
    ) {
      const body: components['schemas']['RegisterProductRequest'] = {
        commandID,
        productID,
        name,
        baseUnit,
      };
      return createdProduct(
        await client.send('POST', `${base(restaurantID)}/warehouse/products`, {
          body,
          epoch,
        }),
      );
    },
    async defineDish(
      restaurantID,
      { dishID, name, ingredients },
      commandID,
      epoch,
    ) {
      const body: components['schemas']['DefineDishRequest'] = {
        commandID,
        dishID,
        name,
        ingredients: ingredients.map(({ productID, quantity, baseUnit }) => ({
          productID,
          quantity,
          baseUnit,
        })),
      };
      return createdDish(
        await client.send('POST', `${base(restaurantID)}/warehouse/dishes`, {
          body,
          epoch,
        }),
      );
    },
  };
}

export function createOrderApi(
  client: Pick<GatewayClient, 'read' | 'send'>,
): OrderApi {
  return {
    async prepare(restaurantID, positions, epoch) {
      const body: components['schemas']['PrepareOrderRequest'] = {
        positions: positions.map(({ dishID, portions }) => ({
          dishID,
          portions,
        })),
      };
      return proposal(
        await client.send(
          'POST',
          `${base(restaurantID)}/serving/order-proposals`,
          { body, epoch },
        ),
      );
    },
    async confirm(restaurantID, proposalID, commandID, epoch) {
      const body: components['schemas']['ConfirmOrderRequest'] = {
        commandID,
        proposalID,
      };
      return confirmed(
        await client.send(
          'POST',
          `${base(restaurantID)}/serving/order-confirmations`,
          {
            body,
            epoch,
          },
        ),
      );
    },
    async resolve(restaurantID, { commandID, proposalID, runtimeEpoch }) {
      return resolved(
        await client.read(
          `${base(restaurantID)}/serving/order-confirmations/resolve?commandID=${query(commandID)}&proposalID=${query(proposalID)}&runtimeEpoch=${query(runtimeEpoch)}`,
          { background: false },
        ),
      );
    },
  };
}
