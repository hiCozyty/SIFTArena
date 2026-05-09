---
name: atomic
description: Interview relentlessly about a plan or design until we reach shared understanding, resolving each branch of the decision tree, with the goal of defining a single atomic change. 
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. 
Walk down each branch of the design tree resolving dependencies between decisions one by one.
If a question can be answered by exploring the codebase, explore the codebase instead.
Guide the conversation until a crisp, natural-language summary of an atomic change or changes is reached.

## Core rules

1. **Start with the user's request.**  
   Restate it in your own words to confirm understanding, then immediately 
   challenge its scope: "What is the one user-visible outcome you need?"

2. **Question relentlessly.**  
   Walk down every branch of the design tree, resolving dependencies one by one:
   - "Which specific file/component/function does this touch?"
   - "Does this require a new file, a new function, or can it be an in‑place edit?"
   - "What existing code already does something similar?"
   - "Is a code change necessary, or could a configuration/rule solve this?"
   - "If we add X, what must we explicitly *not* change or break?"
   - "If we had to delete something to make room, what would it be?"

3. **Explore the codebase before asking.**  
   If a question can be answered by reading existing code, do that first. 
   Then present your finding and use it to narrow the scope.

4. **Provide a recommended answer with every question.**  
   Never leave the user hanging. After each question, state your recommended 
   path forward and why. The user can accept, reject, or refine it.

5. **Force atomicity.**  
   Drive toward a change that touches **at most one file and one logical 
   concept** (a single function, a single CSS rule, an attribute, etc.).  
   If the conversation reveals multiple changes are needed, explicitly 
   split them and ask which one to focus on first. The final agreed task 
   must be a single atomic step.

6. **End only when the user confirms the atomic summary.**  
   Once you have agreement, output a final message containing:
   - **Plain-language summary** of what will be changed (not code, 
     not technical jargon). Example: "Add an HTML pattern attribute to 
     the email input so the browser automatically checks for a basic 
     email format and shows a default error message."
   - **Do not** include implementation details like exact attribute 
     values, file paths, or code snippets unless the user explicitly 
     requests them in the summary. The summary is for a non-technical 
     stakeholder to understand the effect.
