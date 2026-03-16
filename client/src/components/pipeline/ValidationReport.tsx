import { useState, useEffect } from 'react';
import type { ValidationReport as ValidationReportType, SceneMetadata } from '../../types/pipeline.ts';
import { getValidationReport, getSceneMetadata } from '../../api/client.ts';
import { formatPercent } from '../../utils/format.ts';
import './ValidationReport.css';

interface ValidationReportProps {
  sceneId: string;
  onProceed: () => void;
  onRerun: () => void;
}

export function ValidationReport({ sceneId, onProceed, onRerun }: ValidationReportProps) {
  const [report, setReport] = useState<ValidationReportType | null>(null);
  const [metadata, setMetadata] = useState<SceneMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getValidationReport(sceneId)
      .then(setReport)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load validation report'),
      );
    // Fetch metadata (may not exist — that's ok)
    getSceneMetadata(sceneId)
      .then(setMetadata)
      .catch(() => {
        // No metadata available — telemetry section won't render
      });
  }, [sceneId]);

  if (error) {
    return <div className="validation-report validation-report--error">{error}</div>;
  }

  if (!report) {
    return <div className="validation-report">Loading validation report...</div>;
  }

  const regOk = report.registration_rate >= 0.9;
  const reprOk = report.mean_reprojection_error_px < 1.0;

  // Build alignment display string
  let alignmentLabel = 'Manhattan assumption';
  if (metadata) {
    switch (metadata.alignment_strategy) {
      case 'geo_registration':
        alignmentLabel = 'geo-registration (GPS)';
        break;
      case 'gimbal_gravity':
        alignmentLabel = 'Manhattan + gimbal verification';
        break;
    }
  }

  // Gravity agreement from telemetry
  const telemetry = report.telemetry ?? null;

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
              : `${alignmentLabel} \u2705`}
          </span>
        </div>
      </div>

      {/* ── Telemetry Section ─────────────────────────────────── */}
      {metadata && metadata.srt?.available && (
        <div className="validation-report__telemetry">
          <h5>Telemetry</h5>
          <div className="validation-report__rows">
            <div className="validation-report__row">
              <span>Source</span>
              <span>
                DJI SRT
                {metadata.container.camera_model
                  ? ` \u00B7 ${metadata.container.camera_model}`
                  : ''}
              </span>
            </div>

            {metadata.srt.has_gps && metadata.frame_matching && (
              <div className="validation-report__row">
                <span>GPS</span>
                <span>
                  {metadata.frame_matching.matched_with_gps}/{metadata.frame_matching.total_frames} frames
                  {metadata.srt.gps_bounds && (() => {
                    const b = metadata.srt.gps_bounds;
                    // Approximate spread in meters
                    const latSpread = Math.round((b.max_lat - b.min_lat) * 111320);
                    const lonSpread = Math.round(
                      (b.max_lon - b.min_lon) * Math.cos((b.min_lat * Math.PI) / 180) * 111320,
                    );
                    const altSpread =
                      b.min_alt != null && b.max_alt != null
                        ? Math.round(b.max_alt - b.min_alt)
                        : null;
                    const dims = [`${latSpread}m`, `${lonSpread}m`];
                    if (altSpread != null) dims.push(`${altSpread}m`);
                    return ` \u00B7 spread: ${dims.join(' \u00D7 ')}`;
                  })()}
                </span>
              </div>
            )}

            {metadata.srt.has_gimbal && metadata.srt.gimbal_range && (
              <div className="validation-report__row">
                <span>Gimbal</span>
                <span>
                  pitch {metadata.srt.gimbal_range.pitch_min.toFixed(0)}&deg; to{' '}
                  {metadata.srt.gimbal_range.pitch_max.toFixed(0)}&deg;
                  {' \u00B7 '}roll &plusmn;
                  {Math.max(
                    Math.abs(metadata.srt.gimbal_range.roll_min),
                    Math.abs(metadata.srt.gimbal_range.roll_max),
                  ).toFixed(0)}
                  &deg;
                </span>
              </div>
            )}

            <div className="validation-report__row">
              <span>Real-world scale</span>
              <span>{metadata.has_real_world_scale ? 'enabled' : 'not available'}</span>
            </div>

            {telemetry?.gravity_agreement && (
              <div className="validation-report__row">
                <span>Gravity cross-check</span>
                <span
                  className={
                    telemetry.gravity_agreement === 'agree'
                      ? 'validation-report__pass'
                      : telemetry.gravity_agreement === 'disagree'
                        ? 'validation-report__warn'
                        : ''
                  }
                >
                  {telemetry.gravity_agreement === 'agree' && '\u2705 '}
                  {telemetry.gravity_agreement === 'disagree' && '\u26A0\uFE0F '}
                  {telemetry.gravity_check_degrees != null
                    ? `${telemetry.gravity_check_degrees.toFixed(1)}\u00B0`
                    : telemetry.gravity_agreement}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="validation-report__warnings">
          {report.warnings.map((w, i) => (
            <div key={i} className="validation-report__warning-item">
              {'\u26A0\uFE0F'} {w}
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
