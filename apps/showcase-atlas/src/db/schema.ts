/**
 * Local-DB schema for Atlas.
 *
 * Three tables: trips + stops + tiles. Trips own stops; stops carry a
 * lat/lon and may reference an OPFS-stored photo. Tiles is an index of
 * the OSM tiles cached on this device — used for LRU eviction and the
 * storage-budget UI.
 *
 * Everything stays on-device. The companion mesh (see ../sync) shares
 * a Yjs view of an active trip with peers in the same room — it never
 * sees the local DB rows directly.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const TRIPS_TABLE = 'trips';
export const STOPS_TABLE = 'stops';
export const TILES_TABLE = 'tiles';

export const tripsSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  started_on: 'datetime',
  ended_on: 'datetime',
  notes: 'text',
  created_at: 'datetime',
  updated_at: 'datetime',
};

export const stopsSchema: LocalDbSchema = {
  id: 'text primary key',
  trip_id: 'text not null',
  lat: 'real not null',
  lon: 'real not null',
  label: 'text',
  captured_at: 'datetime',
  photo_id: 'text',
  note: 'text',
};

export const tilesSchema: LocalDbSchema = {
  id: 'text primary key',
  trip_id: 'text',
  z: 'integer not null',
  x: 'integer not null',
  y: 'integer not null',
  mime: 'text',
  size_bytes: 'integer not null',
  opfs_path: 'text not null',
  fetched_at: 'datetime',
  last_used_at: 'datetime',
};

export interface Trip {
  id: string;
  name: string;
  started_on?: string | null;
  ended_on?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Stop {
  id: string;
  trip_id: string;
  lat: number;
  lon: number;
  label?: string | null;
  captured_at?: string | null;
  photo_id?: string | null;
  note?: string | null;
}

export interface Tile {
  id: string;
  trip_id?: string | null;
  z: number;
  x: number;
  y: number;
  mime?: string | null;
  size_bytes: number;
  opfs_path: string;
  fetched_at?: string | null;
  last_used_at?: string | null;
}

export interface TripWithStops extends Trip {
  stops: Stop[];
}
