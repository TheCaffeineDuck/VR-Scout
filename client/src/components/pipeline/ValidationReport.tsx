import { useState, useEffect } from 'react';
import type { ValidationReport as ValidationReportType } from '../../types/pipeline.ts';
import { getValidationReport } from '../../api/client.ts';
import { formatPercent } from '../../utils/format.ts';
import './ValidationReport.css';

interface ValidationReportProps {
  sceneId: string;
  onProceed: () => void;
  onRerun: () => void;
}

export function ValidationReport({ sceneId, onProceed, onRerun }: ValidationReportProps) {
  const [report, setReport] = useState<ValidationReportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getValidationReport(sceneId)
      .then(setReport)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load validation report'),
      );
  }, [sceneId]);

  if (error) {
    return <div className="validation-report validation-report--error">{error}</div>;
  }

  if (!report) {
    return <div className="validation-report">Loading validation report...</div>;
  }

  const regOk = report.registration_rate >= 0.9;
  const reprOk = report.mean_reprojection_error_px < 1.0;

  return (
    <div className="validation-report">
      <h4>Validation Report</h4>

      <div className="validation-report__rows">
        <div className="validation-report__row">
          <span>Registration</span>
          <span className={regOk ? 'validation-report__pass' : 'validation-report__warn'}>
            {report.registered_images}/{report.total_images} images
            ({formatPercent(report.registration_rate)})
            {regOk ? ' \u2705' : ' \u26A0\uFE0F'}
          </span>
        </div>
        <div className="validation-report__row">
          <span>Reprojection error</span>
          <span className={reprOk ? 'validation-report__pass' : 'validation-report__warn'}>
            {report.mean_reprojection_error_px.toFixed(2)} px (mean)
            {reprOk ? ' \u2705' : ' \u26A0\uFE0F'}
          </span>
        </div>
        <div className="validation-report__row">
          <span>Camera model</span>
          <span>{report.camera_model}</span>
        </div>
        <div className="validation-report__row">
          <span>Sparse points</span>
          <span>{report.point_count.toLocaleString()}</span>
        </div>
        <div className="validation-report__row">
          <span>Alignment</span>
          <span className={!report.alignment_is_identity ? 'validation-report__pass' : 'validation-report__warn'}>
            {report.alignment_is_identity
              ? 'Identity (auto-alignment may have failed) \u26A0\uFE0F'
              : 'Non-identity transform applied \u2705'}
          </span>
        </div>
      </div>

      {report.warnings.length > 0 && (
        <div className="validation-report__warnings">
          {report.warnings.map((w, i) => (
            <div key={i} className="validation-report__warning-item">
              \u26A0\uFE0F {w}
            </div>
          ))}
        </div>
      )}

      {report.unregistered_images.length > 0 && (
        <div className="validation-report__unregistered">
          {report.unregistered_images.length} images failed to register. These
          regions may have holes in the final scene.
        </div>
      )}

      <div className="validation-report__actions">
        <button className="btn btn--primary" onClick={onProceed}>
          Proceed to Training
        </button>
        <button className="btn btn--ghost" onClick={onRerun}>
          Re-run SfM
        </button>
      </div>
    </div>
  );
}
