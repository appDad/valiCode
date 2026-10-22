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
    e.AttendingProviderID
FROM dbo.Patient p
JOIN dbo.Encounter e ON e.PatientID = p.PatientID
WHERE e.IsDeleted = 0;
