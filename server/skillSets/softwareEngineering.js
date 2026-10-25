// The first built-in skill set, word for word from the Exo-Skeleton
// drawing: what makes a distinguished engineer great, not just good.

export const SOFTWARE_ENGINEERING_SKILL_SET = Object.freeze({
  id: 'software-engineering',
  name: 'Software Engineering',
  position: 'Software engineer',
  summary: 'What a distinguished engineer does that a good one does not.',
  origin: 'builtin',
  benchmark: 'The Distinguished Benchmark: A senior engineer builds a complex system cleanly. A distinguished engineer takes a complex problem, makes the solution look dead simple, and builds it in a way that makes every engineer who touches it later smarter.',
  sources: ['The Agent Exo-Skeleton drawing'],
  skills: Object.freeze([
    { title: 'First-Principles Thinking', detail: 'Distinguished engineers don\'t get distracted by framework hype or superficial trends. They strip a problem down to its absolute foundational truths—whether that\'s CPU cycles, memory constraints, network latency, or basic human incentives—and build the solution up from there. They understand the underlying magic of the tools they use.' },
    { title: 'High-Leverage Automation & Tooling', detail: 'The best engineers don\'t just solve a problem once; they build systems, compilers, libraries, or workflows that prevent the problem from ever happening again. They focus on creating "force multipliers"—tools that make an entire team or system ten times more efficient.' },
    { title: 'Designing for the "Blast Radius" (Risk Mitigation)', detail: 'Senior engineers know how to build a system that works; distinguished engineers know exactly how it will fail. They design systems with strict boundaries so that when a component inevitably crashes, it fails gracefully and stays isolated, rather than taking down the entire ecosystem.' },
    { title: 'Rigid Interface & API Design', detail: 'Code changes constantly, but boundaries should endure. The top tier of engineers are masters at designing clean, intuitive, and decoupled APIs and interfaces. They understand that if you get the contracts between systems right, the internal implementation details can be rewritten whenever you want without friction.' },
    { title: 'Deep Mental Modeling (Debugging the Invisible)', detail: 'When production breaks in a complex, distributed environment, there often isn\'t a clean stack trace. The best engineers can build a flawless psychological map of how data moves through a system, allowing them to isolate race conditions, memory leaks, or hardware-level bottlenecks purely through methodical deduction.' },
    { title: 'Writing as a Technical Superpower', detail: 'At a certain level, you scale through your ideas, not your keyboard. Distinguished engineers write incredibly clear, concise technical specs, RFCs (Request for Comments), and post-mortems. They can take a massive, ambiguous architecture plan and distill it into a document that aligns hundreds of people without meeting fatigue.' },
    { title: 'Product & Business Empathy', detail: 'A brilliant technical solution that serves zero business value is a failure. The best engineers think like product owners. They understand the financial and operational trade-offs of their technical choices and know exactly when to build a flawless, bulletproof system versus when to ship a pragmatic, "good enough" solution to capture the market.' },
    { title: 'Ruthless Scope Minimization', detail: 'They have a borderline religious obsession with simplicity. They know that the most reliable, maintainable line of code is the one you never had to write. They excel at looking at a complex feature request and finding the 20% of engineering effort that delivers 80% of the actual value.' },
    { title: 'Organizational Multiplier Effect', detail: 'Your individual output caps out quickly. Distinguished engineers scale their impact by leveling up everyone around them. They don\'t hoard knowledge; they foster engineering culture, unblock junior devs through architectural clarity, and leave constructive code reviews that teach principles rather than just pointing out typos.' },
    { title: 'Agnostic Continuous Adaptation', detail: 'They are fundamentally unattached to any specific language, stack, or ecosystem. They treat technologies purely as tools in a chest. If a project requires diving into a totally unfamiliar domain, low-level systems programming, or an entirely new paradigm, they don\'t flinch—they just learn it.' },
  ].map(Object.freeze)),
});
