import React, { useState } from 'react';
import { BusinessConfig, Resource } from '../../types';
import { X, Trash2 } from 'lucide-react';

interface ResourceEditModalProps {
  business: BusinessConfig;
  resourceToEdit?: Resource | null;
  onClose: () => void;
  onSave: (resource: Resource) => void;
  onDelete?: (resourceId: string) => void;
  saving?: boolean;
}

export const ResourceEditModal: React.FC<ResourceEditModalProps> = ({
  business,
  resourceToEdit,
  onClose,
  onSave,
  onDelete,
  saving = false
}) => {
  const isEditing = !!resourceToEdit;

  const [name, setName] = useState(resourceToEdit?.name || '');
  const [type, setType] = useState<Resource['type']>(resourceToEdit?.type || 'cabina');
  const [totalQuantity, setTotalQuantity] = useState(resourceToEdit?.totalQuantity || 1);
  const [locationId, setLocationId] = useState(
    resourceToEdit?.locationId || business.locations[0]?.id || ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const updated: Resource = {
      id: resourceToEdit ? resourceToEdit.id : `res_custom_${Date.now()}`,
      name: name.trim(),
      type,
      totalQuantity: Number(totalQuantity),
      locationId
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative my-8 text-xs">
        <button
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg border border-transparent hover:border-[#E5DDD3] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Infraestructura y Capacidad
          </span>
          <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
            {isEditing ? `Editar Recurso: ${resourceToEdit.name}` : 'Añadir Nuevo Recurso'}
          </h3>
          <p className="text-[#80766E] mt-1">
            Define la cantidad real disponible para que el motor evite sobreocupación.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Nombre descriptivo *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Cabina 2 de Masajes o Puesto de Uñas 3"
              className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Tipo de recurso</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                <option value="cabina">Cabina privada</option>
                <option value="camilla">Camilla facial</option>
                <option value="puesto_manicura">Puesto de manicura</option>
                <option value="estacion_corte">Estación de estilismo</option>
                <option value="lavacabezas">Lavacabezas tratante</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Cantidad / Capacidad simultánea</label>
              <input
                type="number"
                min="1"
                max="20"
                required
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Sede / Ubicación</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
            >
              {business.locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 border-t border-[#E5DDD3] flex items-center justify-between">
            {isEditing && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Seguro que deseas eliminar "${resourceToEdit.name}"?`)) {
                    onDelete(resourceToEdit.id);
                  }
                }}
                className="text-xs text-[#CEAAA3] hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#E5DDD3] text-[#80766E] rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg shadow-xs disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar Recurso'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
