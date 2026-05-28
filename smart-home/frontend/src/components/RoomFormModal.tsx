import { useRef, useState, type FormEvent } from 'react';
import {
  createRoom,
  deleteRoomFloorplan,
  updateRoom,
  uploadRoomFloorplan,
  type House,
  type Room,
} from '../api';
import { Modal } from '../ui/Modal';
import { extractError } from '../ui/errors';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_SIZE = 5 * 1024 * 1024;

type Props = {
  /** All houses owned by the user — populates the house picker in create mode. */
  houses: House[];
  /** Pre-selected house id (e.g. the current filter on the page). */
  defaultHouseId?: number | null;
  /** When provided, the modal is in edit mode and prefills fields; house can't change. */
  initial?: Room;
  onClose: () => void;
  onSaved: () => void;
};

export function RoomFormModal({ houses, defaultHouseId, initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [houseId, setHouseId] = useState<number | ''>(
    initial?.house.id ?? defaultHouseId ?? houses[0]?.id ?? '',
  );

  // Floorplan state:
  // - newFile (selected via picker) overrides any current plan visually and on submit
  // - removePlan (only meaningful in edit mode) marks the current plan for deletion
  const [newFile, setNewFile] = useState<File | null>(null);
  const [removePlan, setRemovePlan] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingUrl = initial?.floorplanUrl ?? null;
  const showPlan = newFile ? 'new' : existingUrl && !removePlan ? 'existing' : 'none';

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_SIZE) {
      setError('Файл занадто великий (макс. 5 МБ)');
      return;
    }
    setNewFile(f);
    setRemovePlan(false);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!initial && houseId === '') {
      setError('Виберіть будинок');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const desc = description.trim() || null;
      let roomId: number;
      if (initial) {
        await updateRoom(initial.id, { name: name.trim(), description: desc });
        roomId = initial.id;
      } else {
        const created = await createRoom({
          houseId: houseId as number,
          name: name.trim(),
          description: desc,
        });
        roomId = created.id;
      }

      // Floorplan side-effects, in order:
      if (newFile) {
        await uploadRoomFloorplan(roomId, newFile);
      } else if (initial && removePlan && existingUrl) {
        await deleteRoomFloorplan(roomId);
      }

      onSaved();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={initial ? 'Редагувати кімнату' : 'Нова кімната'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {initial ? (
          <div className="block">
            <div className="text-xs font-medium text-slate-600">Будинок</div>
            <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {initial.house.name}
            </div>
          </div>
        ) : (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Будинок *</span>
            <select
              required
              value={houseId}
              onChange={(e) => setHouseId(e.target.value ? Number(e.target.value) : '')}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="" disabled>
                Оберіть будинок…
              </option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Назва *</span>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Опис</span>
          <textarea
            rows={2}
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        <div>
          <div className="text-xs font-medium text-slate-600 mb-2">План кімнати</div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={onPickFile}
            className="hidden"
          />

          {showPlan === 'none' && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded border border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50 text-slate-600 hover:text-brand-700 text-sm px-3 py-4 transition"
            >
              🗺️ Завантажити зображення плану
              <span className="block text-[11px] text-slate-400 mt-1">
                PNG / JPEG / WebP, до 5 МБ
              </span>
            </button>
          )}

          {showPlan !== 'none' && (
            <div className="flex items-start gap-3">
              {showPlan === 'new' ? (
                <div className="w-32 h-20 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] text-slate-600 text-center p-2">
                  <div className="truncate">📎 {newFile!.name}</div>
                </div>
              ) : (
                <img
                  src={existingUrl!}
                  alt="floorplan"
                  className="w-32 h-20 object-contain rounded border border-slate-200 bg-slate-50"
                />
              )}
              <div className="flex flex-col gap-1.5 pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-brand-600 hover:text-brand-700 text-left"
                >
                  {showPlan === 'new' ? 'Обрати інший файл' : 'Замінити план'}
                </button>
                {showPlan === 'new' ? (
                  <button
                    type="button"
                    onClick={() => setNewFile(null)}
                    className="text-slate-500 hover:text-slate-700 text-left"
                  >
                    Скинути файл
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRemovePlan(true)}
                    className="text-red-600 hover:text-red-700 text-left"
                  >
                    Видалити план
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
