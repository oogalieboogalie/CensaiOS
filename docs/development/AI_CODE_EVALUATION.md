# Critical Evaluation of AI Code

This module is mandatory for all engineers at Censai Hub. It provides a framework for auditing and validating AI-generated code to mitigate security risks and quality issues.

## The Challenge

AI coding assistants are powerful but can introduce:
- **Incorrect logic**: Subtle bugs that pass syntax checks but violate business rules.
- **Insecure defaults**: Permissive CORS, weak crypto, or hardcoded secrets.
- **Over-reliance**: Accepting code without fully understanding its implications.

## Governance Framework

### 1. Mandatory Tagging
All code generated or significantly modified by AI must include a marker:
- `// @ai-generated`
- `/* AI-GENERATED */`

These markers trigger enhanced CI/CD security gates and mandatory logic verification.

### 2. Human-Led Logic Verification Checklist
Reviewers MUST use this checklist for any AI-tagged code:

- [ ] **Intent Validation**: Does the code actually solve the problem it's supposed to?
- [ ] **Edge Cases**: Has the AI considered null values, empty strings, and boundary conditions?
- [ ] **Security**: Are there any hardcoded secrets or permissive security settings?
- [ ] **Performance**: Is the AI-suggested algorithm efficient for our scale?
- [ ] **Consistency**: Does the code follow our project's specific patterns and style?
- [ ] **Dependency Audit**: Does the code introduce unnecessary or untrusted new dependencies?

### 3. Automated Scanning
Our CI pipeline now runs `scripts/ai-security-scanner.mjs` on all files. This script targets:
- Insecure Defaults
- Weak Cryptography
- Subtle Logic Flaws (e.g., non-strict null checks)
- Hardcoded Secret Patterns
- Permissive DB Queries

## Best Practices

- **Never Blindly Commit**: Always read and understand every line suggested by an AI.
- **Iterative Refinement**: Use AI as a starting point, then refine it manually.
- **Test-First**: Write tests before or alongside AI generation to verify correctness.

---
*Completion of this module is required for all engineering staff. Please record your review of this document in your project's compliance log.*
