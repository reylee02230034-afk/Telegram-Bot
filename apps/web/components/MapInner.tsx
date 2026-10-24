'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    AMap: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

interface TeacherMarker {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  username?: string | null;
  bio?: string | null;
  priceInfo?: string | null;
  latitude: number;
  longitude: number;
  distanceKm?: number | null;
  isSelf?: boolean;
  isOnline?: boolean;
}

function waitForAMap(timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.AMap) return resolve(window.AMap);

    const checkStart = Date.now();
    const timer = setInterval(() => {
      if (window.AMap) {
        clearInterval(timer);
        resolve(window.AMap);
        return;
      }
      if (Date.now() - checkStart > timeoutMs) {
        clearInterval(timer);
        reject(new Error('AMap 加载超时，请检查网络或 AMAP_KEY'));
      }
    }, 100);
  });
}

function waitForHeatmap(): Promise<any> {
  return new Promise((resolve) => {
    const AMap = window.AMap;
    if (!AMap) { resolve(null); return; }
    if (typeof AMap.Heatmap === 'function') {
      resolve(AMap.Heatmap);
      return;
    }
    try {
      AMap.plugin(['AMap.Heatmap'], (Heatmap: any) => {
        if (Heatmap) {
          AMap.Heatmap = Heatmap;
          resolve(Heatmap);
        } else if (typeof AMap.Heatmap === 'function') {
          resolve(AMap.Heatmap);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

function escapeHtml(s?: string | null): string {
  return (s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function createInfoContent(t: TeacherMarker): string {
  const name = escapeHtml(t.displayName);
  const price = t.priceInfo
    ? `<div style="margin-top:6px;font-size:12px;color:#b45309;">💰 ${escapeHtml(t.priceInfo.split('\n')[0])}</div>`
    : '';
  const bio = t.bio
    ? `<div style="margin-top:4px;font-size:12px;color:#64748b;line-height:1.4;">${escapeHtml(t.bio)}</div>`
    : '';
  const distance = t.distanceKm != null
    ? `<div style="font-size:11px;color:#94a3b8;">约 ${t.distanceKm} km</div>`
    : '';
  const avatar = t.avatarUrl
    ? `<img src="${escapeHtml(t.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />`
    : (t.isSelf ? '我' : '师');

  const action = t.isSelf
    ? `<div style="margin-top:6px;font-size:11px;color:#94a3b8;text-align:center;">我的位置</div>`
    : `<div style="margin-top:8px;">
         <button id="amap-detail-btn-${t.id}" style="
           width:100%;padding:6px 12px;background:#3390ec;color:white;
           border:none;border-radius:14px;cursor:pointer;font-size:13px;font-weight:600;
         ">查看详情</button>
       </div>`;

  return `
    <div style="padding:8px 12px 10px;min-width:170px;max-width:230px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="
          width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;
          background:#e2e8f0;display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:700;color:#64748b;
        ">${avatar}</div>
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
          ${distance}
        </div>
      </div>
      ${price}
      ${bio}
      ${action}
    </div>
  `;
}

function createMarkerContent(t: TeacherMarker): string {
  const borderColor = t.isSelf ? '#ff6b35' : t.isOnline ? '#22c55e' : '#94a3b8';
  const size = t.isSelf ? 40 : 36;
  const pulse = t.isOnline && !t.isSelf ? `
    <div style="
      position:absolute;inset:-8px;border-radius:50%;
      border:2px solid ${borderColor};opacity:0;
      animation:pulse 2s ease-out infinite;
    "></div>` : '';
  const initials = t.avatarUrl
    ? `<img src="${t.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.innerHTML+='${t.isSelf ? '我' : '师'}'">`
    : (t.isSelf ? '我' : '师');

  return `
    <div style="position:relative;width:${size+16}px;height:${size+16}px;">
      ${pulse}
      <div style="
        position:absolute;top:8px;left:8px;
        width:${size}px;height:${size}px;border-radius:50%;
        background:${t.avatarUrl ? 'white' : borderColor};
        border:3px solid ${borderColor};
        box-shadow:0 4px 12px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:700;color:${t.avatarUrl ? '#333' : 'white'};
        overflow:hidden;cursor:pointer;
        transition:transform 0.15s;
      ">${initials}</div>
      <style>
        @keyframes pulse {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      </style>
    </div>
  `;
}

interface HeatPoint {
  lng: number;
  lat: number;
  count: number;
}

const HEATMAP_CONFIG = {
  radius: 35,
  opacity: [0.15, 0.85] as [number, number],
  gradient: {
    0.1: 'rgba(255,255,255,0.0)',
    0.25: 'rgba(255,214,10,0.4)',
    0.5: 'rgba(255,120,0,0.6)',
    0.75: 'rgba(255,30,30,0.75)',
    1.0: 'rgba(180,0,0,0.85)',
  },
};

export default function MapInner({
  center,
  teachers,
  onMarkerClick,
  heatmapPoints,
  showHeatmap,
}: {
  center: [number, number];
  teachers: TeacherMarker[];
  onMarkerClick: (id: string) => void;
  heatmapPoints?: HeatPoint[];
  showHeatmap?: boolean;
}) {
  const containerIdRef = useRef<string>(
    `amap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const heatmapRef = useRef<any>(null);
  const heatmapCtorRef = useRef<any>(null);
  const centerRef = useRef(center);
  const teachersRef = useRef(teachers);
  const heatPointsRef = useRef(heatmapPoints);
  const showHeatRef = useRef(showHeatmap);
  const clickHandlerRef = useRef(onMarkerClick);

  centerRef.current = center;
  teachersRef.current = teachers;
  heatPointsRef.current = heatmapPoints;
  showHeatRef.current = showHeatmap;
  clickHandlerRef.current = onMarkerClick;

  const updateHeatmap = (pts?: HeatPoint[]) => {
    const map = mapRef.current;
    if (!map) return;
    if (!showHeatRef.current) {
      if (heatmapRef.current && typeof heatmapRef.current.setDataSet === 'function') {
        try { heatmapRef.current.setDataSet({ data: [] }); } catch {}
      }
      return;
    }
    const points = pts ?? heatPointsRef.current ?? [];
    if (points.length === 0) {
      if (heatmapRef.current && typeof heatmapRef.current.setDataSet === 'function') {
        try { heatmapRef.current.setDataSet({ data: [] }); } catch {}
      }
      return;
    }
    const HeatmapCtor = heatmapCtorRef.current;
    if (!HeatmapCtor) return;
    try {
      if (!heatmapRef.current) {
        heatmapRef.current = new HeatmapCtor(map, HEATMAP_CONFIG);
      }
      if (heatmapRef.current && typeof heatmapRef.current.setDataSet === 'function') {
        heatmapRef.current.setDataSet({
          data: points,
          max: Math.max(...points.map((p) => p.count), 1),
        });
      }
    } catch (err) {
      console.warn('[AMap] Heatmap update failed:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let map: any = null;
    let resizeObserver: ResizeObserver | null = null;

    waitForAMap()
      .then(async (AMap) => {
        if (cancelled) return;

        const container = document.getElementById(containerIdRef.current);
        if (!container) return;

        map = new AMap.Map(container, {
          zoom: 14,
          center: [centerRef.current[1], centerRef.current[0]],
          mapStyle: 'amap://styles/normal',
          viewMode: '2D',
        });
        mapRef.current = map;

        const renderMarkers = (list: TeacherMarker[]) => {
          if (!map) return;
          markersRef.current.forEach((m) => map.remove(m));
          markersRef.current = [];

          list.forEach((t) => {
            const marker = new AMap.Marker({
              position: [t.longitude, t.latitude],
              content: createMarkerContent(t),
              anchor: 'center',
              offset: new AMap.Pixel(0, 0),
              extData: t,
            });

            marker.on('click', () => {
              const info = new AMap.InfoWindow({
                content: createInfoContent(t),
                offset: new AMap.Pixel(0, -20),
              });
              info.open(map, [t.longitude, t.latitude]);
              if (t.isSelf) return;
              setTimeout(() => {
                const btn = document.getElementById(`amap-detail-btn-${t.id}`);
                btn?.addEventListener('click', () => clickHandlerRef.current(t.id));
              }, 10);
            });

            map.add(marker);
            markersRef.current.push(marker);
          });
        };

        renderMarkers(teachersRef.current);

        if (showHeatRef.current) {
          const HeatmapCtor = await waitForHeatmap();
          if (!cancelled && HeatmapCtor) {
            heatmapCtorRef.current = HeatmapCtor;
            updateHeatmap();
          }
        }

        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(container);

        const moveTimer = setInterval(() => {
          const latest = teachersRef.current;
          if (JSON.stringify(latest) !== JSON.stringify(markersRef.current.map((m) => m.getExtData()))) {
            renderMarkers(latest);
          }
        }, 500);

        (map as any).__cleanup = () => {
          clearInterval(moveTimer);
          if (resizeObserver) resizeObserver.disconnect();
          try { heatmapRef.current?.hide?.(); } catch {}
          map.destroy();
          mapRef.current = null;
          markersRef.current = [];
          heatmapRef.current = null;
          heatmapCtorRef.current = null;
        };
      })
      .catch((err) => {
        console.error('[AMap] 初始化失败:', err.message);
        const container = document.getElementById(containerIdRef.current);
        if (container) {
          container.innerHTML = `<div style="padding:24px;color:#ef4444;text-align:center;font-size:14px;">
            ⚠️ 地图加载失败<br><span style="color:#64748b;font-size:12px;">${err.message}</span>
          </div>`;
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current?.__cleanup) {
        mapRef.current.__cleanup();
      }
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && centerRef.current) {
      const [lat, lon] = centerRef.current;
      mapRef.current.setZoomAndCenter(14, [lon, lat], false);
    }
  }, [center]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!showHeatmap) {
      updateHeatmap([]);
      return;
    }
    if (!heatmapCtorRef.current) {
      waitForHeatmap().then((Ctor) => {
        if (Ctor) {
          heatmapCtorRef.current = Ctor;
          updateHeatmap();
        }
      });
      return;
    }
    updateHeatmap();
  }, [heatmapPoints, showHeatmap]);

  return (
    <div
      id={containerIdRef.current}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
