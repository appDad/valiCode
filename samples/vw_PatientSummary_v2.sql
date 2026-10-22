CREATE VIEW dbo.vw_PatientSummary
AS
SELECT
    p.PatientID,
    p.MRN,
    p.LastName + ', ' + p.FirstName AS PatientName,
    p.DOB,
    DATEDIFF(year, p.DOB, GETDATE()) AS Age,
    e.EncounterID,
    e.AdmitDate,
    e.DischargeDate,
    e.AttendingProviderID,
    pr.ProviderName AS AttendingProvider,
    CASE WHEN e.DischargeDate IS NULL THEN 1 ELSE 0 END AS IsInpatient
FROM dbo.Patient p
JOIN dbo.Encounter e ON e.PatientID = p.PatientID
LEFT JOIN dbo.Provider pr ON pr.ProviderID = e.AttendingProviderID
WHERE e.IsDeleted = 0
  AND e.AdmitDate >= '2020-01-01';
