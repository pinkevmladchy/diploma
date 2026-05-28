import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DeviceType } from '../api';
import { DeviceIcon } from './devices';
import { PencilIcon } from './icons';

export type FloorplanDevice = {
  id: string;
  name: string;
  type: DeviceType;
  floorplanX: number | null;
  floorplanY: number | null;
};

type Props = {
  imageUrl: string;
  devices: FloorplanDevice[];
  /** Place / move a device. Coordinates are normalized [0..1]. */
  onPlace: (deviceId: string, x: number, y: number) => void;
  /** Remove a device from the plan (sets coords to null). */
  onRemove: (deviceId: string) => void;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function Floorplan({ imageUrl, devices, onPlace, onRemove }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [showAdder, setShowAdder] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    function move(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      onPlace(dragging!, x, y);
    }
    function up() {
      setDragging(null);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [dragging, onPlace]);

  // Close the adder popover when leaving edit mode.
  useEffect(() => {
    if (!editMode) setShowAdder(false);
  }, [editMode]);

  const placed = devices.filter((d) => d.floorplanX !== null && d.floorplanY !== null);
  const unplaced = devices.filter((d) => d.floorplanX === null);

  return (
    <div
      ref={containerRef}
      className={`relative inline-block max-w-full max-h-full select-none ${editMode ? 'cursor-crosshair' : ''}`}
    >
      <img
        src={imageUrl}
        alt="Floorplan"
        draggable={false}
        className="block max-w-full max-h-full object-contain rounded border border-slate-200 bg-slate-50"
      />

      {/* Top-right toolbar */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
        {editMode && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAdder((v) => !v)}
              className="inline-flex items-center gap-1 rounded bg-white/95 hover:bg-white text-slate-700 hover:text-brand-700 text-xs font-medium px-2.5 py-1 shadow-sm border border-slate-200"
              title="Додати пристрій на план"
            >
              <span className="text-base leading-none">+</span>
              <span>Додати</span>
              {unplaced.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[10px] px-1.5">
                  {unplaced.length}
                </span>
              )}
            </button>
            {showAdder && (
              <div className="absolute right-0 mt-1 min-w-[200px] max-w-[260px] rounded-lg border border-slate-200 bg-white shadow-lg p-1">
                {unplaced.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    Усі пристрої вже на плані.
                  </div>
                ) : (
                  unplaced.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        onPlace(d.id, 0.5, 0.5);
                        setShowAdder(false);
                      }}
                      className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <DeviceIcon
                        type={d.type}
                        className="w-4 h-4 text-slate-500 shrink-0"
                        aria-hidden
                      />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? 'Завершити редагування' : 'Редагувати розташування'}
          className={`inline-flex items-center gap-1 rounded text-xs font-medium px-2.5 py-1 shadow-sm border transition-colors ${
            editMode
              ? 'bg-brand-600 hover:bg-brand-700 text-white border-brand-700'
              : 'bg-white/95 hover:bg-white text-slate-700 border-slate-200'
          }`}
        >
          <PencilIcon className="w-3.5 h-3.5" />
          <span>{editMode ? 'Готово' : 'Редагувати'}</span>
        </button>
      </div>

      {/* Device markers */}
      {placed.map((d) => {
        const x = (d.floorplanX as number) * 100;
        const y = (d.floorplanY as number) * 100;
        return (
          <div
            key={d.id}
            style={{ left: `${x}%`, top: `${y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
          >
            <button
              type="button"
              title={d.name}
              onMouseDown={(e) => {
                if (!editMode) return;
                e.preventDefault();
                e.stopPropagation();
                setDragging(d.id);
              }}
              onClick={() => {
                if (editMode) return;
                navigate(`/devices/${d.id}`);
              }}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white shadow-md ring-2 ring-white hover:scale-110 transition-transform ${
                editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
              }`}
              aria-label={d.name}
            >
              <DeviceIcon type={d.type} className="w-4 h-4" />
            </button>

            {editMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(d.id);
                }}
                title="Прибрати з плану"
                aria-label="Прибрати з плану"
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-[10px] leading-none flex items-center justify-center shadow ring-2 ring-white"
              >
                ×
              </button>
            )}

            <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/85 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
              {d.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
