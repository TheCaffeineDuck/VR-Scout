import type { ValidationReport as ValidationReportData } from '../../types/pipeline';

interface ValidationReportProps {
  report: ValidationReportData;
  onConfirm?: () => void;
}

function MetricRow({
  label,
  value,
  pass,
}: {
  label: string;
  value: string;
  pass?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-white font-medium">{value}</span>
        {pass !== undefined && (
          <span className={`text-xs px-2 py-0.5 rounded ${pass ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            {pass ? 'PASS' : 'FAIL'}
          </span>
        )}
      </div>
    </div>
  );
}

/** COLMAP validation report with registration rate and reprojection error */
export function ValidationReport({
  report,
  onConfirm,
}: ValidationReportProps): React.JSX.Element {
  const regPass = report.registrationRate >= 0.7;
  const reprPass = report.reprojectionError < 2.0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Validation Report
      </h2>

      <div>
        <MetricRow
          label="Registration Rate"
          value={`${(report.registrationRate * 100).toFixed(1)}%`}
          pass={regPass}
        />
        <MetricRow
          label="Reprojection Error"
          value={`${report.reprojectionError.toFixed(3)} px`}
          pass={reprPass}
        />
        <MetricRow
          label="Point Count"
          value={report.pointCount.toLocaleString()}
        />
        <MetricRow
          label="Camera Model"
          value={report.cameraModel}
        />
        <MetricRow
          label="Registered Images"
          value={String(report.imageCount)}
        />
        <MetricRow
          label="Alignment Status"
          value={report.alignmentStatus}
          pass={report.alignmentStatus === 'success' || report.alignmentStatus === 'good'}
        />
      </div>

      {onConfirm && (
        <button
          onClick={onConfirm}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Confirm and Continue
        </button>
      )}
    </div>
  );
}
