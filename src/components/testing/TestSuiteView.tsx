import React, { useState, useEffect } from 'react';
import { runAllEngineTests, TestResult } from '../../services/testsEngine';
import { 
  CheckCircle2, 
  XCircle, 
  Play, 
  ShieldCheck, 
  RefreshCw, 
  Layers, 
  Cpu,
  Info
} from 'lucide-react';

export const TestSuiteView: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [expandedTestId, setExpandedTestId] = useState<number | null>(null);

  const executeTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const results = runAllEngineTests();
      setTestResults(results);
      setIsRunning(false);
    }, 200);
  };

  useEffect(() => {
    executeTests();
  }, []);

  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.passed).length;
  const allPassed = totalTests > 0 && passedTests === totalTests;

  const categories = Array.from(new Set(testResults.map(r => r.category)));

  const filteredResults = activeCategoryFilter === 'all'
    ? testResults
    : testResults.filter(r => r.category === activeCategoryFilter);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 lg:py-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E5DDD3] mb-8">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#B69A70] font-semibold block mb-0.5">
            Batería de Pruebas Obligatorias · Sección 16
          </span>
          <h2 className="font-serif-editorial text-3xl sm:text-4xl font-normal text-[#302C29]">
            Laboratorio de Validación del Motor de Turnos
          </h2>
          <p className="text-xs text-[#80766E] max-w-xl mt-1">
            Certificación estricta de las 18 situaciones de conflicto, concurrencia, simultaneidad autorizada y capacidad de recursos.
          </p>
        </div>

        <button
          onClick={executeTests}
          disabled={isRunning}
          className="px-5 py-2.5 bg-[#302C29] hover:bg-[#1a1715] disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Ejecutando Pruebas...' : 'Ejecutar las 18 Pruebas'}</span>
        </button>
      </div>

      {/* Metric Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-[#E5DDD3] rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#A3B6A5]/20 text-[#5e7761] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-[#80766E] block font-medium">Estado General</span>
            <span className="text-lg font-bold text-[#302C29]">
              {allPassed ? '100% Invariantes Aprobados' : 'Pruebas en Ejecución'}
            </span>
          </div>
        </div>

        <div className="bg-white border border-[#E5DDD3] rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#FAF8F4] border border-[#E5DDD3] text-[#302C29] flex items-center justify-center shrink-0 font-bold tabular-nums">
            {passedTests}/{totalTests}
          </div>
          <div>
            <span className="text-xs text-[#80766E] block font-medium">Pruebas Superadas</span>
            <span className="text-lg font-bold text-[#302C29] tabular-nums">
              {passedTests} de {totalTests} escenarios
            </span>
          </div>
        </div>

        <div className="bg-white border border-[#E5DDD3] rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#F0EAE2] text-[#B69A70] flex items-center justify-center shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-[#80766E] block font-medium">Motor de Planificación</span>
            <span className="text-sm font-semibold text-[#302C29]">
              Prevención Atómica Activa
            </span>
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-[#E5DDD3] mb-6 text-xs">
        <button
          onClick={() => setActiveCategoryFilter('all')}
          className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
            activeCategoryFilter === 'all'
              ? 'bg-[#302C29] text-white font-medium'
              : 'text-[#80766E] hover:text-[#302C29]'
          }`}
        >
          Todas las situaciones ({totalTests})
        </button>
        {categories.map(cat => {
          const count = testResults.filter(r => r.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap cursor-pointer ${
                activeCategoryFilter === cat
                  ? 'bg-[#302C29] text-white font-medium'
                  : 'text-[#80766E] hover:text-[#302C29]'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Tests list */}
      <div className="space-y-3">
        {filteredResults.map(test => {
          const isExpanded = expandedTestId === test.id;
          return (
            <div
              key={test.id}
              className="bg-white border border-[#E5DDD3] rounded-xl overflow-hidden transition-all shadow-xs"
            >
              <div
                onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                className="p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#FAF8F4]/50"
              >
                <div className="flex items-start gap-3.5">
                  <div className="mt-0.5">
                    {test.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-[#5e7761]" />
                    ) : (
                      <XCircle className="w-5 h-5 text-[#CEAAA3]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#80766E]">
                        #{test.id.toString().padStart(2, '0')}
                      </span>
                      <span className="text-xs font-semibold text-[#80766E]">
                        · {test.category}
                      </span>
                    </div>
                    <h4 className="font-serif-editorial text-lg font-medium text-[#302C29] mt-0.5">
                      {test.title}
                    </h4>
                    <p className="text-xs text-[#80766E] mt-1">
                      {test.explanation}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded ${
                    test.passed ? 'bg-[#A3B6A5]/20 text-[#302C29]' : 'bg-[#CEAAA3]/30 text-[#80766E]'
                  }`}>
                    {test.passed ? 'Superado' : 'Falló'}
                  </span>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-[#E5DDD3]/60 bg-[#FAF8F4]/70 text-xs text-[#302C29]">
                  <div className="font-semibold text-[#80766E] mb-1 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#B69A70]" />
                    <span>Detalle de ejecución y aserción matemática:</span>
                  </div>
                  <pre className="font-mono text-[11px] bg-white p-3 rounded-lg border border-[#E5DDD3] overflow-x-auto text-[#302C29]">
                    {test.details}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
