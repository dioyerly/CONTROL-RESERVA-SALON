import React, { useState } from 'react';
import { BusinessConfig, Service, BundlePricingRule } from '../../types';
import { X, Check } from 'lucide-react';

interface ServiceEditModalProps {
  business: BusinessConfig;
  serviceToEdit?: Service | null;
  onClose: () => void;
  onSave: (service: Service) => void;
  onDelete?: (serviceId: string) => void;
}

export const ServiceEditModal: React.FC<ServiceEditModalProps> = ({
  business,
  serviceToEdit,
  onClose,
  onSave,
  onDelete
}) => {
  const isEditing = !!serviceToEdit;

  const [name, setName] = useState(serviceToEdit?.name || '');
  const [categoryId, setCategoryId] = useState(serviceToEdit?.categoryId || business.categories[0]?.id || '');
  const [description, setDescription] = useState(serviceToEdit?.description || '');
  const [imageUrl, setImageUrl] = useState<string>(serviceToEdit?.imageUrl || '');
  const [imageError, setImageError] = useState<string | null>(null);

  // Reduce la foto a 360 px de ancho en JPEG para que pese poco en el almacenamiento
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('El archivo debe ser una imagen.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const width = 360;
        const height = Math.round((img.height / img.width) * width);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setImageError('No se pudo procesar la imagen.');
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        setImageUrl(canvas.toDataURL('image/jpeg', 0.8));
        setImageError(null);
      };
      img.onerror = () => setImageError('No se pudo leer la imagen.');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  const [durationMinutes, setDurationMinutes] = useState(serviceToEdit?.durationMinutes || 45);
  const [bufferCleanupMinutes, setBufferCleanupMinutes] = useState(serviceToEdit?.bufferCleanupMinutes || 10);
  const [price, setPrice] = useState(serviceToEdit?.price || 30000);
  const [priceType, setPriceType] = useState<Service['priceType']>(serviceToEdit?.priceType || 'fixed');
  const [requiredResourceType, setRequiredResourceType] = useState<string>(
    serviceToEdit?.requiredResourceTypes[0] || 'puesto_manicura'
  );
  const [allowSimultaneous, setAllowSimultaneous] = useState(serviceToEdit?.allowSimultaneous || false);
  const [isOnlineBookingEnabled, setIsOnlineBookingEnabled] = useState(
    serviceToEdit?.isOnlineBookingEnabled !== false
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const updatedService: Service = {
      id: serviceToEdit ? serviceToEdit.id : `serv_custom_${Date.now()}`,
      categoryId,
      name: name.trim(),
      description: description.trim(),
      imageUrl: imageUrl || undefined,
      durationMinutes: Number(durationMinutes),
      bufferCleanupMinutes: Number(bufferCleanupMinutes),
      minAdvanceHours: serviceToEdit?.minAdvanceHours || 2,
      price: Number(price),
      priceType,
      enabledProfessionalIds: serviceToEdit?.enabledProfessionalIds || ['*'],
      requiredResourceTypes: requiredResourceType ? [requiredResourceType] : [],
      locationIds: serviceToEdit?.locationIds || business.locations.map(l => l.id),
      allowSimultaneous,
      requiresConsultation: false,
      isOnlineBookingEnabled
    };

    onSave(updatedService);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative my-8 text-xs">
        <button
          onClick={onClose}
          aria-label="Cerrar modal"
          className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg border border-transparent hover:border-[#E5DDD3] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Gestión de Servicios
          </span>
          <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29]">
            {isEditing ? 'Editar Servicio y Precio' : 'Nuevo Servicio de Autor'}
          </h3>
          <p className="text-[#80766E] mt-1">
            Configura duración, tiempos de limpieza y precios a tu manera.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Nombre del servicio *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Peinado & Brillo Botánico"
              className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Categoría</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                {business.categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Modalidad de precio</label>
              <select
                value={priceType}
                onChange={(e) => setPriceType(e.target.value as any)}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              >
                <option value="fixed">Precio Fijo</option>
                <option value="starting_at">Precio Desde (Variable)</option>
                <option value="consult">A Consultar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Precio ($ ARS)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Duración del servicio (min)</label>
              <input
                type="number"
                step="5"
                min="10"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#302C29] mb-1">Buffer limpieza post-servicio (min)</label>
              <input
                type="number"
                step="5"
                min="0"
                value={bufferCleanupMinutes}
                onChange={(e) => setBufferCleanupMinutes(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Recurso físico exclusivo necesario</label>
            <select
              value={requiredResourceType}
              onChange={(e) => setRequiredResourceType(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
            >
              <option value="">Ninguno (Uso general)</option>
              <option value="cabina">Cabina privada de masajes</option>
              <option value="camilla">Camilla de facial</option>
              <option value="puesto_manicura">Puesto ergonómico de manicura</option>
              <option value="estacion_corte">Estación de estilismo / corte</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Descripción breve del tratamiento</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle sensorial y técnico para el cliente"
              className="w-full p-2.5 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#302C29] mb-1">Foto del servicio (opcional)</label>
            <div className="flex items-center gap-3">
              {imageUrl && (
                <img src={imageUrl} alt="Vista previa del servicio" className="w-24 h-16 object-cover rounded-lg border border-[#E5DDD3]" />
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="text-xs text-[#80766E]"
                />
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="text-xs text-[#80766E] hover:underline text-left cursor-pointer"
                  >
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
            {imageError && <p className="text-[11px] text-[#b37a70] mt-1">{imageError}</p>}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowSimultaneous}
                onChange={(e) => setAllowSimultaneous(e.target.checked)}
                className="rounded border-[#E5DDD3] text-[#302C29] focus:ring-[#B69A70]"
              />
              <span className="text-[#302C29] font-medium">Permite simultaneidad autorizada</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isOnlineBookingEnabled}
                onChange={(e) => setIsOnlineBookingEnabled(e.target.checked)}
                className="rounded border-[#E5DDD3] text-[#302C29] focus:ring-[#B69A70]"
              />
              <span className="text-[#302C29] font-medium">Visible para reserva online</span>
            </label>
          </div>

          <div className="pt-4 border-t border-[#E5DDD3] flex items-center justify-between">
            {isEditing && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Seguro que deseas eliminar "${name}"?`)) {
                    onDelete(serviceToEdit.id);
                  }
                }}
                className="text-xs text-[#CEAAA3] hover:underline"
              >
                Eliminar servicio
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
                className="px-5 py-2 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg shadow-xs"
              >
                Guardar Servicio
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
