// Review Materials content. One page per subject, all sharing one layout.
// Placeholder lessons until Supabase. Add topics or lessons here and the page picks them up.
import {
  BookOpen, ClipboardCheck, User, GraduationCap, Briefcase, Brain, Scale, Calculator, Languages, Library, FlaskConical
} from '@lucide/svelte';

const L = (title, min, a, b, key) => ({ title, min, sections: [{ h: a[0], p: a[1] }, { h: b[0], p: b[1] }], key });

export const SUBJECTS = {
  general: {
    label: 'General Education',
    sub: 'Read the core GenEd topics here, then drill what you learned.',
    topics: [
      { name: 'Intellectual Competencies', icon: Brain, lessons: [
        L('Critical Thinking and Fallacies', 6,
          ['What critical thinking is', 'Critical thinking is the disciplined habit of analyzing claims, checking evidence and drawing conclusions that follow logically. In the exam you are often asked to spot the assumption behind an argument or to choose the conclusion the evidence actually supports.'],
          ['Common fallacies', 'Ad hominem attacks the person instead of the argument. A hasty generalization jumps from too few cases to a broad claim. Post hoc assumes that because B followed A, A caused B. A false dilemma offers only two options when more exist.'],
          ['A fallacy is an error in reasoning, not just a false statement.', 'Ad hominem targets the person, not the claim.', 'Correlation in time does not prove causation.'])
      ]},
      { name: 'Personal and Civic Responsibilities', icon: Scale, lessons: [
        L('The Bill of Rights', 6,
          ['Where it sits', 'Article III of the 1987 Constitution is the Bill of Rights. It protects individuals against abuse of government power, covering due process, equal protection, privacy, free speech and the rights of the accused.'],
          ['Rights that are often tested', 'No person shall be deprived of life, liberty or property without due process of law. The right against unreasonable searches and seizures normally requires a judicial warrant. The writ of habeas corpus protects against illegal detention.'],
          ['Article III is the Bill of Rights of the 1987 Constitution.', 'Due process and equal protection are the core guarantees.', 'A judicial warrant is the general rule for searches and arrests.'])
      ]},
      { name: 'Practical Skills Development', icon: Calculator, lessons: [
        L('Mean, Median and Mode', 5,
          ['Measures of central tendency', 'The mean is the sum of all values divided by their count. The median is the middle value when the data are ordered. The mode is the value that appears most often.'],
          ['Choosing the right measure', 'Extreme scores pull the mean up or down, so the median describes skewed data better. For 2, 3, 3, 5, 12 the mean is 5, the median is 3 and the mode is 3.'],
          ['Mean = sum of values ÷ number of values.', 'The median resists extreme scores.', 'A data set can have no mode, one mode or several.'])
      ]}
    ]
  },

  professional: {
    label: 'Professional Education',
    sub: 'Pick a topic, read it here, then drill what you learned.',
    topics: [
      { name: 'Child and Adolescent Learners', icon: User, lessons: [
        L('Piaget’s Stages of Cognitive Development', 6,
          ['The four stages', 'Piaget described sensorimotor (birth to 2), preoperational (2 to 7), concrete operational (7 to 11) and formal operational (11 and up) thinking. Children move through them in order, though ages are approximate.'],
          ['Key ideas inside each stage', 'Object permanence develops in the sensorimotor stage. Egocentrism and symbolic play mark the preoperational stage. Conservation and logical thinking about concrete things appear next. Abstract and hypothetical reasoning arrive in the formal stage.'],
          ['The stages are fixed in order: sensorimotor, preoperational, concrete operational, formal operational.', 'Conservation signals the concrete operational stage.', 'Abstract reasoning signals the formal operational stage.']),
        L('Vygotsky and the Zone of Proximal Development', 5,
          ['Learning is social', 'Vygotsky argued that learning first happens between people and is then internalized. Language and culture are the tools that shape thinking.'],
          ['ZPD and scaffolding', 'The Zone of Proximal Development is the gap between what a learner can do alone and what they can do with help. Scaffolding is temporary support from a teacher or a more capable peer that is withdrawn as the learner grows more independent.'],
          ['The ZPD is the gap between independent and assisted performance.', 'Scaffolding is gradually removed as skill grows.', 'Peer collaboration supports learning in the ZPD.'])
      ]},
      { name: 'Assessment of Learning', icon: ClipboardCheck, lessons: [
        L('What Is Assessment?', 5,
          ['Measurement, assessment, evaluation', 'Measurement gathers data, usually as scores. Assessment collects and interprets that evidence to understand learning. Evaluation makes a judgment about quality or value, such as passing or failing.'],
          ['Why teachers assess', 'Assessment diagnoses needs, guides instruction, gives feedback and documents achievement. Good assessment is aligned with the learning objectives it claims to measure.'],
          ['Measurement is quantifying, assessment is interpreting, evaluation is judging.', 'Assessment should match the learning objectives.', 'Results are used to improve both learning and teaching.']),
        L('Formative vs. Summative Assessment', 6,
          ['Understanding the difference', 'Formative assessment happens during learning to monitor progress, give feedback and adjust instruction. Examples include quizzes, class discussion, observation and exit tickets. It is usually not used for grading.'],
          ['Summative assessment', 'Summative assessment happens at the end of a unit or term to determine what learners have achieved. It is used for grading and certification, such as quarterly exams, unit tests or the LET itself.'],
          ['Formative assessment is ongoing and for improvement.', 'Summative assessment is final and for grading.', 'Both are essential and work together for effective learning.']),
        L('Validity and Reliability', 6,
          ['Validity', 'A test is valid when it measures what it is supposed to measure. Content validity checks coverage of the objectives, and a table of specifications helps ensure it. Criterion-related validity compares scores with another trusted measure.'],
          ['Reliability', 'A test is reliable when it gives consistent results. Test-retest, split-half and internal consistency are common ways to check it. A test can be reliable without being valid, but it cannot be valid if it is not reliable.'],
          ['Validity is accuracy. Reliability is consistency.', 'A table of specifications supports content validity.', 'Reliability is necessary but not sufficient for validity.']),
        L('Norm- vs. Criterion-Referenced Interpretation', 5,
          ['Norm-referenced', 'Scores are compared with those of a group. Percentile rank and stanine are common norm-referenced scores. They tell you how a learner ranks, not what the learner mastered.'],
          ['Criterion-referenced', 'Scores are compared with a fixed standard, such as 75% mastery of an objective. They tell you what a learner can do regardless of how classmates performed.'],
          ['Norm-referenced compares learners with a group.', 'Criterion-referenced compares learners with a standard.', 'Choose based on the decision the teacher needs to make.'])
      ]},
      { name: 'Curriculum, Methods and Educational Technology', icon: BookOpen, lessons: [
        L('Revised Bloom’s Taxonomy', 6,
          ['The six levels', 'From lowest to highest: Remember, Understand, Apply, Analyze, Evaluate, Create. In the revised version the levels are verbs, and Create sits at the top.'],
          ['Writing objectives', 'Match the verb to the level. Define and list are Remember. Explain and summarize are Understand. Solve and use are Apply. Compare and differentiate are Analyze. Judge and critique are Evaluate. Design and compose are Create.'],
          ['Remember, Understand, Apply, Analyze, Evaluate, Create.', 'Create replaced Evaluate at the top of the revised taxonomy.', 'Pick objective verbs that match the intended level.']),
        L('Backward Design', 5,
          ['Three stages', 'Backward design, from Wiggins and McTighe, starts from the end. First identify the desired results. Second determine acceptable evidence. Third plan the learning experiences and instruction.'],
          ['Why it works', 'Starting with the goal keeps assessments and activities aligned with what learners should actually achieve, instead of covering content just because it is in the textbook.'],
          ['Results first, evidence second, activities last.', 'Assessments are designed before lessons.', 'Alignment is the main benefit.'])
      ]},
      { name: 'Teaching Profession', icon: Briefcase, lessons: [
        L('Key Laws for Teachers', 6,
          ['RA 4670 and RA 7836', 'Republic Act 4670 is the Magna Carta for Public School Teachers and protects their rights, benefits and working conditions. Republic Act 7836, the Philippine Teachers Professionalization Act of 1994, regulates teacher licensure and is amended by RA 9293.'],
          ['Who regulates teachers', 'The Professional Regulation Commission, through the Board for Professional Teachers, administers the LET and issues licenses.'],
          ['RA 4670 is the Magna Carta for Public School Teachers.', 'RA 7836 professionalized teaching and is amended by RA 9293.', 'The PRC administers the LET.']),
        L('Code of Ethics for Professional Teachers', 5,
          ['Purpose', 'The Code of Ethics sets the standards of conduct for licensed teachers. It was adopted by the PRC through the Board for Professional Teachers in 1997.'],
          ['Core duties', 'Teachers must act with honesty and fairness, respect learners’ rights and dignity, maintain professional growth, and avoid conduct that brings the profession into disrepute.'],
          ['Adopted through PRC Resolution No. 435, s. 1997.', 'It covers duties to learners, the community and the profession.', 'Professional growth is an ethical duty.'])
      ]},
      { name: 'Field Study and Teaching Internship', icon: GraduationCap, lessons: [
        L('The Action Research Cycle', 5,
          ['Four steps', 'Action research is teacher-led inquiry into classroom practice. The cycle is plan, act, observe and reflect, then repeat with a revised plan.'],
          ['In the classroom', 'A teacher notices low participation, tries a new grouping strategy, observes the effect on engagement, and reflects on whether to keep, change or drop the strategy.'],
          ['Plan, act, observe, reflect.', 'The cycle repeats with a revised plan.', 'It aims to improve your own classroom practice.']),
        L('Kolb’s Experiential Learning Cycle', 5,
          ['Four stages', 'Concrete experience, reflective observation, abstract conceptualization and active experimentation. Learning is complete only when the cycle is carried through.'],
          ['Use in practicum', 'Student teachers teach a lesson, reflect on what happened, link it to theory and then try a refined approach in the next lesson.'],
          ['Experience leads to reflection, then theory, then experimentation.', 'Reflection is what turns experience into learning.', 'Fits the student teaching internship well.'])
      ]}
    ]
  },

  major: {
    label: 'Major / Specialization',
    sub: 'Specialization review for English. More majors are coming soon.',
    topics: [
      { name: 'Theoretical Foundations of Language, Culture, Literacies, and Literature', icon: Languages, lessons: [
        L('Krashen’s Monitor Model', 6,
          ['Five hypotheses', 'Krashen proposed the acquisition-learning, monitor, natural order, input and affective filter hypotheses. Acquisition is the subconscious process that produces fluency, while learning is conscious knowledge of rules.'],
          ['Comprehensible input', 'Learners progress when they receive input slightly beyond their current level, written i + 1. A low affective filter, meaning low anxiety and high motivation, lets that input in.'],
          ['Acquisition is subconscious, learning is conscious.', 'Comprehensible input is i + 1.', 'Anxiety raises the affective filter and blocks acquisition.'])
      ]},
      { name: 'Literature', icon: Library, lessons: [
        L('Elements of Fiction', 6,
          ['The main elements', 'Plot, character, setting, point of view, theme, tone and style. Plot moves through exposition, rising action, climax, falling action and resolution.'],
          ['Point of view and theme', 'First-person narrators use I and see only their own thoughts. Third-person omniscient narrators know every character’s mind. The theme is the central idea about life, not just the topic of the story.'],
          ['Plot: exposition, rising action, climax, falling action, resolution.', 'Point of view controls what the reader can know.', 'Theme is the underlying message.'])
      ]},
      { name: 'Methodology', icon: FlaskConical, lessons: [
        L('Communicative Language Teaching', 6,
          ['Core idea', 'Communicative Language Teaching aims to build the ability to communicate meaningfully, not just to know grammar rules. Fluency and appropriateness matter as much as accuracy.'],
          ['Classroom features', 'Pair and group work, information-gap tasks, role plays and authentic materials. The teacher is a facilitator, and errors are treated as a natural part of learning.'],
          ['Communicative competence is the goal.', 'Tasks use real communication, such as information gaps and role plays.', 'The teacher facilitates and learners interact.'])
      ]}
    ]
  }
};

export const ORDER = ['general', 'professional', 'major'];
