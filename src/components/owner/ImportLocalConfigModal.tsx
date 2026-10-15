import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { AgendaBlock, BusinessConfig } from '../../types';
import { getActiveBusiness, getAgendaBlocks } from '../../services/storage';
import {
  buildImportPlan,
  ImportItem,
  ImportPlan,
  ImportResult,
  ImportSection,
  runImport
} from '../../services/ownerImport';

interface ImportLocalConfigModalProps {
  remote: BusinessConfig;
  remoteBlocks: AgendaBlock[];
  onClose: () => void;
  onImported: () => void;
}

type ItemSection = 'locations' | 'services' | 'staff' | 'resources' | 'blocks';

const SECTIONS: { id: ItemSection; title: string; section: ImportSection; editable: boolean }[] = [
  { id: 'locations', title: 'Sedes', section: 'Sedes', editable: true },
  { id: 'services', title: 'Servicios', section: 'Servicios', editable: true },
  { id: 'staff', title: 'Equipo', section: 'Equipo', editable: true },
  { id: 'resources', title: 'Recursos', section: 'Recursos', editable: true },
  { id: 'blocks', title: 'Bloqueos de agenda', section: 'Bloqueos', editable: false }
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const INPUT = 'w-full p-2 rounded-lg border border-[#E5DDD3] bg-[#FAF8F4] text-xs text-[#302C29]';

// Vista previa de la importación. Lee localStorage y no escribe nada hasta que la usuaria confirma.
export const ImportLocalConfigModal: React.FC<ImportLocalConfigModalProps> = ({ remote, remoteBlocks, onClose, onImported }) => {
  const [initial] = useState(() => {
    const local = getActiveBusiness();
    const blocks = local ? getAgendaBlocks(local.id) : [];
    return { hasLocal: !!local, plan: buildImportPlan(local, blocks, remote, remoteBlocks, todayIso()) };
  });
  const [plan, setPlan] = useState<ImportPlan>(initial.plan);
  const [phase, setPhase] = useState<'preview' | 'running' | 'done'>('preview');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const patchItem = (section: ItemSection, key: string, patch: { included?: boolean; label?: string }) => {
    setPlan(prev => ({
      ...prev,
      [section]: (prev[section] as ImportItem<unknown>[]).map(i => (i.key === key ? { ...i, ...patch } : i))
    }));
  };

  const patchSchedule = (included: boolean) => {
    setPlan(prev => (prev.schedule ? { ...prev, schedule: { ...prev.schedule, included } } : prev));
  };

  const selectedCount =
    SECTIONS.reduce((n, s) => n + (plan[s.id] as ImportItem<unknown>[]).filter(i => i.included).length, 0) +
    (plan.schedule?.included ? 1 : 0);

  const handleRun = async () => {
    if (phase === 'running' || selectedCount === 0) return;
    setPhase('running');
    setRunError(null);
    try {
      const r = await runImport(remote.id, plan);
      setResults(r);
      setPhase('done');
    } catch (err) {
      setRunError((err as Error).message);
      setPhase('preview');
    }
  };

  const renderItems = (id: ItemSection, editable: boolean) => {
    const items = plan[id] as ImportItem<unknown>[];
    if (items.length === 0) {
      return <p className="text-[#80766E]">No hay registros en este navegador.</p>;
    }
    return (
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 border border-[#E5DDD3] rounded-lg bg-white">
            <label className="flex items-center gap-2 shrink-0">
              <input
                type="checkbox"
                checked={item.included}
                disabled={phase !== 'preview'}
                onChange={e => patchItem(id, item.key, { included: e.target.checked })}
              />
              <span className="sr-only">Importar {item.label}</span>
            </label>
            <div className="flex-1 min-w-0">
              {editable ? (
                <input
                  type="text"
                  value={item.label}
                  disabled={phase !== 'preview'}
                  onChange={e => patchItem(id, item.key, { label: e.target.value })}
                  className={INPUT}
                  aria-label="Nombre al importar"
                />
              ) : (
                <span className="block text-[#302C29] break-words">{item.label}</span>
              )}
              <span className={`block mt-1 text-[11px] ${item.exists ? 'text-[#80766E]' : 'text-[#B69A70]'}`}>
                {item.note}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const renderResults = () => {
    const bySection = SECTIONS.map(s => ({
      title: s.title,
      rows: results.filter(r => r.section === s.section)
    })).filter(g => g.rows.length > 0);
    return (
      <div className="space-y-4">
        {bySection.map(g => (
          <div key={g.title}>
            <h4 className="font-semibold text-[#302C29] mb-1">{g.title}</h4>
            <ul className="space-y-1">
              {g.rows.map((r, i) => (
                <li key={`${r.label}-${i}`} className="flex flex-wrap gap-2 items-baseline">
                  <span className="font-medium text-[#302C29] break-words">{r.label}</span>
                  <span className={
                    r.outcome === 'error' ? 'text-[#CEAAA3] font-semibold'
                      : r.outcome === 'importado' ? 'text-[#5e7761] font-semibold'
                      : 'text-[#80766E]'
                  }>
                    {r.outcome === 'importado' ? 'Importado' : r.outcome === 'omitido' ? 'Omitido' : 'Error'}
                  </span>
                  {r.message && <span className="text-[#80766E]">· {r.message}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {results.length === 0 && <p className="text-[#80766E]">No se seleccionó nada para importar.</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#302C29]/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5DDD3] rounded-2xl w-full max-w-2xl p-6 sm:p-8 shadow-2xl relative my-8 text-xs">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-5 right-5 text-[#80766E] hover:text-[#302C29] p-1.5 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="text-[11px] uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
          Configuración de este navegador
        </span>
        <h3 className="font-serif-editorial text-2xl font-normal text-[#302C29] mb-2">Importar al negocio</h3>
        <p className="text-[#80766E] mb-5">
          Se copian a la base los datos guardados en este navegador. Tu configuración local no se modifica.
          Los turnos, clientes, contraseñas y PIN no se importan. Lo que ya existe en la base se omite.
        </p>

        {!initial.hasLocal && (
          <div className="p-3 mb-4 bg-[#FAF8F4] border border-[#E5DDD3] rounded-lg text-[#80766E]">
            No hay configuración guardada en este navegador. No hay nada para importar.
          </div>
        )}

        {runError && (
          <div role="alert" className="mb-4 p-3 bg-[#FAF8F4] border border-[#CEAAA3] rounded-lg text-[#302C29] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#CEAAA3] shrink-0 mt-0.5" />
            <span>No pudimos leer la base para importar: {runError}</span>
          </div>
        )}

        {phase === 'done' ? renderResults() : (
          <div className="space-y-6">
            {SECTIONS.map(s => (
              <section key={s.id}>
                <h4 className="font-serif-editorial text-lg text-[#302C29] mb-2">{s.title}</h4>
                {renderItems(s.id, s.editable)}
              </section>
            ))}

            {plan.schedule && (
              <section>
                <h4 className="font-serif-editorial text-lg text-[#302C29] mb-2">Horario y cierres</h4>
                <label className="flex items-start gap-2 p-2 border border-[#E5DDD3] rounded-lg bg-white">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={plan.schedule.included}
                    disabled={phase !== 'preview'}
                    onChange={e => patchSchedule(e.target.checked)}
                  />
                  <span>
                    <span className="block text-[#302C29]">{plan.schedule.label}</span>
                    <span className={`block mt-1 text-[11px] ${plan.schedule.exists ? 'text-[#CEAAA3]' : 'text-[#B69A70]'}`}>
                      {plan.schedule.note}
                    </span>
                  </span>
                </label>
              </section>
            )}
          </div>
        )}

        <div className="pt-5 mt-5 border-t border-[#E5DDD3] flex flex-wrap items-center justify-end gap-3">
          {phase === 'done' ? (
            <button
              type="button"
              onClick={() => { onImported(); onClose(); }}
              className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg cursor-pointer"
            >
              Cerrar y actualizar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'running'}
                className="px-4 py-2.5 border border-[#E5DDD3] text-[#80766E] rounded-lg cursor-pointer disabled:opacity-60"
              >
                Cancelar sin importar
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={phase === 'running' || selectedCount === 0 || !initial.hasLocal}
                className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] text-white font-medium rounded-lg cursor-pointer disabled:opacity-60"
              >
                {phase === 'running' ? 'Importando…' : `Importar ${selectedCount} elemento(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
