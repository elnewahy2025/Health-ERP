# Ship-readiness research notes

## Sources reviewed

1. WHO, Digital health: https://www.who.int/health-topics/digital-health
   - Digital health is a health-system transformation topic, not merely an application deployment exercise.
   - The plan should include governance, implementation, safety, workforce adoption, and evaluation.

2. HL7, FHIR v5.0.0 Overview: https://www.hl7.org/fhir/overview.html
   - FHIR is a standard for exchanging healthcare information electronically.
   - FHIR uses structured Resources, references, CapabilityStatements, StructureDefinitions, terminology, security/privacy, conformance, clinical, diagnostic, medication, workflow, and financial modules.
   - A product claiming interoperability needs resource mappings, profiles, capability statements, terminology bindings, conformance tests, and integration workflows—not only a JSON export button.

3. ISO, IEC 62304:2006 Medical device software — Software life cycle processes: https://www.iso.org/standard/38421.html
   - IEC 62304 defines life-cycle requirements for medical device software and a common framework of processes, activities, and tasks.
   - A ship plan must therefore include documented requirements, risk management, architecture/design controls, verification, validation, release configuration, defect handling, maintenance, and traceability where the product’s intended use brings it into scope.

## Application-specific evidence

- Current repository snapshot: 70 backend modules, 88 frontend pages, 51 migrations, 27 backend test files, and 5 frontend test files.
- Full backend run during this assessment: 26 test files passed, 1 skipped; 212 tests passed, 3 skipped. The audit service test emitted a database insert error while still passing because the service catches the error, so this is not evidence of a successful live audit-log write.
- The frontend contains hardcoded dashboard activity and trend values such as `Ahmed Mohamed`, `INV-001`, `+12%`, `+5%`, and `+8%`, which must be replaced with real scoped data before shipment.
- Production Docker configuration exists, but environment configuration and service wiring are not equivalent to a completed production deployment, backup restoration rehearsal, capacity test, or hospital pilot.
- The current repository has a strong authorization foundation, but clinical validation, interoperability certification/testing, financial closing/reconciliation validation, end-to-end hospital workflow evidence, user acceptance, and disaster-recovery evidence remain release gates.
