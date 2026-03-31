import type { ValidationReport as ValidationReportData } from '../../types/pipeline';

interface ValidationReportProps {
  report: ValidationReportData;
}

/** COLMAP validation report with registration rate and reprojection error */
export function ValidationReport({
  report,
}: ValidationReportProps): React.JSX.Element {
  // TODO: Implement validation report display with pass/fail indicators
  return (
    <div className="validation-report">
      <h2>Validation Report</h2>
      <p>TODO: Registration rate: {report.registrationRate}</p>
    </div>
  );
}
