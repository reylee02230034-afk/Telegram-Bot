'use client';

import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';

interface SearchProvider {
  id: string;
  businessName: string;
  distanceKm: number;
  location: { lat: number; lon: number };
  priceRange: { min: number | null; max: number | null };
  category: { nameZh: string };
  isOpen: boolean;
}

function FlyTo({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom(), { duration: 0.5 });
  }, [center, map]);
  return null;
}

function getIcons() {
  return {
    defaultIcon: L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 24px; height: 24px; border-radius: 50%;
        background: #3390ec; border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [24, 24],
    }),
    openIcon: L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 28px; height: 28px; border-radius: 50%;
        background: #10b981; border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [28, 28],
    }),
  };
}

export default function MapView({
  position,
  providers,
  loading,
}: {
  position: [number, number];
  providers: SearchProvider[];
  loading: boolean;
}) {
  const icons = getIcons();

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <MapContainer
        center={position}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution=""
          url={process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        />
        <FlyTo center={position} />
        {providers.map((p) => (
          <Marker
            key={p.id}
            position={[p.location.lat, p.location.lon]}
            icon={p.isOpen ? icons.openIcon : icons.defaultIcon}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.businessName}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{p.category.nameZh} · {p.distanceKm}km</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {p.priceRange.min !== null
                    ? `¥${p.priceRange.min}${p.priceRange.max && p.priceRange.max !== p.priceRange.min ? ` - ¥${p.priceRange.max}` : ''}`
                    : '价格面议'}
                </div>
                <a
                  href={`/providers/${p.id}`}
                  style={{
                    display: 'block',
                    marginTop: 8,
                    background: '#3390ec',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: 6,
                    textAlign: 'center',
                    textDecoration: 'none',
                    fontSize: 12,
                  }}
                >
                  查看详情
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {loading && (
        <div
          style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.95)', padding: '8px 16px', borderRadius: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 14, zIndex: 500,
          }}
        >
          加载中...
        </div>
      )}
      <div
        style={{
          position: 'absolute', bottom: 16, left: 16, right: 16,
          background: 'rgba(255,255,255,0.95)', padding: '8px 12px', borderRadius: 12,
          fontSize: 13, zIndex: 500, display: 'flex', gap: 12, alignItems: 'center',
        }}
      >
        <span><span className="tag tag-open">●</span> 营业中 ({providers.filter(p => p.isOpen).length})</span>
        <span><span className="tag tag-closed">●</span> 已暂停</span>
      </div>
    </div>
  );
}
