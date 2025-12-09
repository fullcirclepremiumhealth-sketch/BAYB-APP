// BAYB Voice-Driven Onboarding Component
// File: /components/PathwayOnboarding.tsx
// Complete 61-question conversational onboarding with conditional logic

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, ChevronRight, ArrowLeft } from 'lucide-react';
import logo from 'figma:asset/dc06e66bfc41b0bc908f84999525af5151c85168.png';
import { speakWithElevenLabs, stopSpeaking as stopElevenLabsSpeaking } from '../utils/elevenlabs-tts';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface PathwayOnboardingProps {
  userId: string;
  onComplete: () => void;
}

interface Question {
  id: string;
  text: string;
  field: string;
  section?: string;
  conditional?: (data: any) => boolean;
}

export function PathwayOnboarding({ userId, onComplete }: PathwayOnboardingProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showTranscript, setShowTranscript] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const hasSpokenRef = useRef(false);

  // All 61 questions with conditional logic
  const allQuestions: Question[] = [
    {
      id: 'intro',
      text: "Hello Gorgeous. I'm BAYB, your life's new chief operating officer. I'm so excited to get to know you, so let's dive into these questions that will assist me in getting to know you better. You merely tap the microphone to talk back to me when you answer. Are you ready?",
      field: 'ready',
      section: 'Introduction'
    },
    {
      id: 'q1',
      text: "What is your name darling?",
      field: 'name',
      section: 'Getting to Know You'
    },
    {
      id: 'q2',
      text: "What is your date of birth? You can say something like, March 16, 1970 or 3/16/70, either works.",
      field: 'dateOfBirth',
      section: 'Getting to Know You'
    },
    {
      id: 'q3',
      text: "What time zone are you in? I want to ensure I check in at the proper times.",
      field: 'timezone',
      section: 'Getting to Know You'
    },
    {
      id: 'q4',
      text: "What time do you typically go to bed in the evening and how many hours of sleep would you say you get?",
      field: 'sleepSchedule',
      section: 'Getting to Know You'
    },
    {
      id: 'q5',
      text: "What time do you typically get up in the morning?",
      field: 'wakeTime',
      section: 'Getting to Know You'
    },
    {
      id: 'q6_intro',
      text: "Let's dive into some questions about your hormonal cycles.",
      field: 'cycles_intro',
      section: 'Hormonal Cycles'
    },
    {
      id: 'q6',
      text: "Are you currently still getting periods, yes or no?",
      field: 'hasPeriods',
      section: 'Hormonal Cycles'
    },
    {
      id: 'q7',
      text: "Tell me the date of the first day of your last period?",
      field: 'lastPeriodDate',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q8',
      text: "What is the frequency of your period, meaning how often do you typically get them? You can say something like every 28 days or I don't know.",
      field: 'periodFrequency',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q9',
      text: "What is the typical duration of your period? You can say something like, I usually bleed for about 5 days.",
      field: 'periodDuration',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q10',
      text: "What is the typical flow of your period? You can say something like, the first two days are heavy and the other days are light.",
      field: 'periodFlow',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q11',
      text: "Would you classify your periods as regular, meaning they come around the same frequency every month? You can say yes, no, or I don't know.",
      field: 'periodsRegular',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q12',
      text: "Do you currently use a period tracker app?",
      field: 'usesPeriodTracker',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q13',
      text: "Would you like instructions on how to download your data to integrate it with me? You can say yes or no.",
      field: 'wantsDataIntegration',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const hasPeriods = data.hasPeriods?.toLowerCase() || '';
        const usesTracker = data.usesPeriodTracker?.toLowerCase() || '';
        return (hasPeriods.includes('yes') || hasPeriods.includes('yeah')) && 
               (usesTracker.includes('yes') || usesTracker.includes('yeah'));
      }
    },
    {
      id: 'q13_instructions',
      text: "Perfect! To export your data, open your period tracker app, go to settings, look for 'Export Data' or 'Download Data', and save the file. Then you can upload it in the BAYB integrations menu. Now let's continue.",
      field: 'dataInstructions',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const wantsIntegration = data.wantsDataIntegration?.toLowerCase() || '';
        return wantsIntegration.includes('yes') || wantsIntegration.includes('yeah');
      }
    },
    {
      id: 'q14',
      text: "Are you on any forms of birth control or hormonal replacement therapies?",
      field: 'birthControlOrHRT',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q15_intro',
      text: "Now let's move onto how your cycle affects you.",
      field: 'cycle_effects_intro',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q15',
      text: "Do you experience any premenstrual symptoms, such as mood changes, anxiety, irritation, bloating, breast tenderness, cravings, or anything else? If so, please list each one.",
      field: 'premenstrualSymptoms',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q16',
      text: "List any symptoms you experience during your periods, like cramps, headaches, nausea, fatigue, etc.",
      field: 'periodSymptoms',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q17',
      text: "Do you notice if your energy changes throughout your cycles, yes or no?",
      field: 'energyChanges',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q18',
      text: "Which part of your cycle do you feel you have the most energy?",
      field: 'mostEnergyPhase',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const hasPeriods = data.hasPeriods?.toLowerCase() || '';
        const energyChanges = data.energyChanges?.toLowerCase() || '';
        return (hasPeriods.includes('yes') || hasPeriods.includes('yeah')) && 
               (energyChanges.includes('yes') || energyChanges.includes('yeah'));
      }
    },
    {
      id: 'q19',
      text: "Which part of your cycle do you feel you have the least amount of energy?",
      field: 'leastEnergyPhase',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const hasPeriods = data.hasPeriods?.toLowerCase() || '';
        const energyChanges = data.energyChanges?.toLowerCase() || '';
        return (hasPeriods.includes('yes') || hasPeriods.includes('yeah')) && 
               (energyChanges.includes('yes') || energyChanges.includes('yeah'));
      }
    },
    {
      id: 'q20',
      text: "On a scale of 1 to 10, 1 being tolerable and 10 being excruciating, what number would you rate your pain while on your period?",
      field: 'periodPainRating',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q21',
      text: "Are there any other symptoms or patterns you would like me to track for you? If so, please list them.",
      field: 'otherSymptoms',
      section: 'Hormonal Cycles',
      conditional: (data) => {
        const answer = data.hasPeriods?.toLowerCase() || '';
        return answer.includes('yes') || answer.includes('yeah') || answer.includes('still');
      }
    },
    {
      id: 'q22',
      text: "Let's shift gears and look at life. Do you have children, if so how many, what are their ages and names?",
      field: 'children',
      section: 'Life & Family'
    },
    {
      id: 'q23',
      text: "Please list all the responsibilities that fall onto your shoulders when it comes to managing the children.",
      field: 'childcareResponsibilities',
      section: 'Life & Family',
      conditional: (data) => {
        const answer = data.children?.toLowerCase() || '';
        return !answer.includes('no') && !answer.includes('none') && !answer.includes("don't");
      }
    },
    {
      id: 'q24',
      text: "Do you get emails from the children's schools that you would like me to scan for you, to help you organize your children's lives into your own, such as their sports activities, extracurricular activities, school functions, etc.?",
      field: 'scanSchoolEmails',
      section: 'Life & Family',
      conditional: (data) => {
        const answer = data.children?.toLowerCase() || '';
        return !answer.includes('no') && !answer.includes('none') && !answer.includes("don't");
      }
    },
    {
      id: 'q25',
      text: "Please list the children's schools so that I may know which emails to look out for.",
      field: 'childrenSchools',
      section: 'Life & Family',
      conditional: (data) => {
        const hasChildren = data.children?.toLowerCase() || '';
        const scanEmails = data.scanSchoolEmails?.toLowerCase() || '';
        return (!hasChildren.includes('no') && !hasChildren.includes('none')) && 
               (scanEmails.includes('yes') || scanEmails.includes('yeah'));
      }
    },
    {
      id: 'q26',
      text: "Would you like me to read to you the dates/times that involve one of your child's names so that I can discuss adding things within the emails to your family calendar?",
      field: 'readChildEvents',
      section: 'Life & Family',
      conditional: (data) => {
        const hasChildren = data.children?.toLowerCase() || '';
        const scanEmails = data.scanSchoolEmails?.toLowerCase() || '';
        return (!hasChildren.includes('no') && !hasChildren.includes('none')) && 
               (scanEmails.includes('yes') || scanEmails.includes('yeah'));
      }
    },
    {
      id: 'q27',
      text: "Do you primarily care for the household or do you also have a job outside the household?",
      field: 'workSituation',
      section: 'Work & Productivity'
    },
    {
      id: 'q28',
      text: "What is that job, what are your typical working hours like 9-5, and how would you classify the stress level?",
      field: 'jobDetails',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q29',
      text: "Do you have responsibilities of being in a leadership position or managing other employees?",
      field: 'leadershipRole',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q30',
      text: "Do you feel satisfied with your job?",
      field: 'jobSatisfaction',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q31',
      text: "Are you seeking to be more productive at work?",
      field: 'seekingProductivity',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q32',
      text: "What would you say the biggest challenges are at work for productivity? What gets in the way of crushing your to-do list?",
      field: 'productivityChallenges',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q33',
      text: "When do you feel the most focused? In the morning, afternoon, or evening?",
      field: 'mostFocusedTime',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q34',
      text: "How do you prefer to organize your tasks? Batching similar things together or mixing it up throughout the day?",
      field: 'taskOrganization',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q35',
      text: "If you're on your period or used to get periods but you have/had a deadline, how did you handle getting things done? Was or is there something specific that works for you?",
      field: 'periodDeadlineStrategy',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q36',
      text: "Do you have a work calendar and if yes, would you like me to integrate your google or outlook calendar?",
      field: 'workCalendarIntegration',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q37',
      text: "Would you like daily reminders of items on your calendar for the day and/or for the next day?",
      field: 'calendarReminders',
      section: 'Work & Productivity',
      conditional: (data) => {
        const answer = data.workSituation?.toLowerCase() || '';
        return answer.includes('job') || answer.includes('work') || answer.includes('both');
      }
    },
    {
      id: 'q38',
      text: "Please list the responsibilities that fall onto your shoulders when it comes to household duties?",
      field: 'householdResponsibilities',
      section: 'Household Management'
    },
    {
      id: 'q39',
      text: "Are you looking to be more productive within the house? Such as meal prepping, organizing time to get things around the house done, etc.?",
      field: 'householdProductivity',
      section: 'Household Management'
    },
    {
      id: 'q40_intro',
      text: "Let's dive into some health and wellness.",
      field: 'health_intro',
      section: 'Health & Wellness'
    },
    {
      id: 'q40',
      text: "Do you work out regularly and if so, how often?",
      field: 'workoutFrequency',
      section: 'Health & Wellness'
    },
    {
      id: 'q41',
      text: "List your goals with fitness such as increasing productivity, losing weight, gaining muscle, etc.",
      field: 'fitnessGoals',
      section: 'Health & Wellness'
    },
    {
      id: 'q42',
      text: "How tall are you? You can say something like 5 foot 6 inches or 5-6.",
      field: 'height',
      section: 'Health & Wellness'
    },
    {
      id: 'q43',
      text: "How much do you currently weigh?",
      field: 'weight',
      section: 'Health & Wellness'
    },
    {
      id: 'q44',
      text: "What types of ways do you move your body or work out?",
      field: 'workoutTypes',
      section: 'Health & Wellness'
    },
    {
      id: 'q45',
      text: "How would you describe your current diet?",
      field: 'dietDescription',
      section: 'Health & Wellness'
    },
    {
      id: 'q46',
      text: "Do you have any nutrition goals, such as decreasing sugar intake, increasing protein or fiber, etc.?",
      field: 'nutritionGoals',
      section: 'Health & Wellness'
    },
    {
      id: 'q47',
      text: "Do you have any dietary restrictions?",
      field: 'dietaryRestrictions',
      section: 'Health & Wellness'
    },
    {
      id: 'q48',
      text: "How many meals do you eat in a day?",
      field: 'mealsPerDay',
      section: 'Health & Wellness'
    },
    {
      id: 'q49',
      text: "Do you often snack? And if so, what kinds of snack foods do you eat?",
      field: 'snackingHabits',
      section: 'Health & Wellness'
    },
    {
      id: 'q50',
      text: "How much water do you think you drink daily?",
      field: 'waterIntake',
      section: 'Health & Wellness'
    },
    {
      id: 'q51_intro',
      text: "Let's talk about stress.",
      field: 'stress_intro',
      section: 'Stress Management'
    },
    {
      id: 'q51',
      text: "What are your main sources of stress right now?",
      field: 'stressSources',
      section: 'Stress Management'
    },
    {
      id: 'q52',
      text: "What current coping mechanisms do you have in place and do you think they're working?",
      field: 'copingMechanisms',
      section: 'Stress Management'
    },
    {
      id: 'q53',
      text: "What helps you feel calm and centered?",
      field: 'calmingActivities',
      section: 'Stress Management'
    },
    {
      id: 'q54_intro',
      text: "A few other items to cover. Don't worry we're almost done darling.",
      field: 'medical_intro',
      section: 'Medical History'
    },
    {
      id: 'q54',
      text: "Do you have any current medical diagnosis from a doctor, like hypertension, ADHD, etc? If so, please list them.",
      field: 'medicalDiagnoses',
      section: 'Medical History'
    },
    {
      id: 'q55',
      text: "Do you have any current gynecological diagnosis such as PCOS, or endometriosis? If so, please list them.",
      field: 'gynecologicalDiagnoses',
      section: 'Medical History'
    },
    {
      id: 'q56',
      text: "Are you on any current medications? If yes, please list the name, the dose, and the frequency of each.",
      field: 'medications',
      section: 'Medical History'
    },
    {
      id: 'q57',
      text: "Are you on any over the counter medications, like herbs or supplements? If so, please list the name, dosage, and frequency of each.",
      field: 'supplements',
      section: 'Medical History'
    },
    {
      id: 'q58',
      text: "Would you like medication reminders? Such as, it's time to change your estradiol patch. If so, please list which medications you would like me to remind you to take and if you want the reminders daily, an hour before, right on time, etc? What would be the most helpful?",
      field: 'medicationReminders',
      section: 'Medical History'
    },
    {
      id: 'q59',
      text: "Are there any lab results your doctor drew that you'd like to tell me, such as hemoglobin levels, vitamin D levels, thyroid levels, hormone levels? If so, please list each name and the result.",
      field: 'labResults',
      section: 'Medical History'
    },
    {
      id: 'q60_intro',
      text: "Integrations:",
      field: 'integrations_intro',
      section: 'Integrations'
    },
    {
      id: 'q60',
      text: "Are there any other integrations you would like to set up aside from Google or Outlook, such as Slack, Whoop, Fitbit, Or Oura Ring? Just let me know which one and I will let you know if we're able to integrate.",
      field: 'otherIntegrations',
      section: 'Integrations'
    },
    {
      id: 'q61',
      text: "Would you like to receive insights from me, such as energy levels that could impact your calendar items or task list?",
      field: 'wantsInsights',
      section: 'Integrations'
    },
    {
      id: 'q62_intro',
      text: "Wonderful Darling. Sorry this was a bit tedious, the more I get to know you the more helpful I can be.",
      field: 'vision_intro',
      section: 'Your Vision'
    },
    {
      id: 'q62',
      text: "Last item, I want you to fast forward 6 months from now and tell me what success looks like to you?",
      field: 'visionOfSuccess',
      section: 'Your Vision'
    },
    {
      id: 'completion',
      text: "Amazing. We already know how bad-ass you are, now is the time for me to help you by predicting patterns, offering suggestions, optimizing your schedule, and helping you work WITH your body, not against it. So, Welcome to BAYB, where women are building the world.",
      field: 'completion',
      section: 'Welcome to BAYB'
    }
  ];

  const getActiveQuestions = (): Question[] => {
    return allQuestions.filter(q => {
      if (!q.conditional) return true;
      return q.conditional(answers);
    });
  };

  const activeQuestions = getActiveQuestions();
  const currentQuestion = activeQuestions[currentIndex];
  const progress = ((currentIndex + 1) / activeQuestions.length) * 100;

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcriptResult = event.results[current][0].transcript;
        setTranscript(transcriptResult);
        
        if (event.results[current].isFinal) {
          setShowTranscript(true);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (currentQuestion && !hasSpokenRef.current) {
      hasSpokenRef.current = true;
      speakQuestion();
    }
  }, [currentIndex, currentQuestion]);

  const speakQuestion = async () => {
    if (!currentQuestion) return;
    
    setIsSpeaking(true);
    await speakWithElevenLabs(currentQuestion.text, {
      audioEnabled,
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      setShowTranscript(false);
      stopElevenLabsSpeaking();
      setIsSpeaking(false);
      
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting recognition:', error);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleNext = async () => {
    if (!transcript.trim() && currentQuestion.id !== 'intro' && currentQuestion.id !== 'completion') {
      return;
    }

    const newAnswers = {
      ...answers,
      [currentQuestion.field]: transcript.trim()
    };
    setAnswers(newAnswers);

    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/onboarding/save`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId,
            field: currentQuestion.field,
            value: transcript.trim(),
            allAnswers: newAnswers
          })
        }
      );
    } catch (error) {
      console.error('Error saving answer:', error);
    }

    if (currentIndex >= activeQuestions.length - 1) {
      try {
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/onboarding/complete`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId,
              onboardingData: newAnswers
            })
          }
        );
        
        setTimeout(() => {
          onComplete();
        }, 3000);
      } catch (error) {
        console.error('Error completing onboarding:', error);
        onComplete();
      }
      return;
    }

    setTranscript('');
    setShowTranscript(false);
    setCurrentIndex(currentIndex + 1);
    hasSpokenRef.current = false;
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setTranscript('');
      setShowTranscript(false);
      hasSpokenRef.current = false;
    }
  };

  const toggleAudio = () => {
    const newAudioEnabled = !audioEnabled;
    setAudioEnabled(newAudioEnabled);
    if (!newAudioEnabled) {
      stopElevenLabsSpeaking();
      setIsSpeaking(false);
    }
  };

  if (!currentQuestion) {
    return null;
  }

  const isIntroOrCompletion = currentQuestion.id === 'intro' || 
                               currentQuestion.id === 'completion' ||
                               currentQuestion.field.includes('_intro');

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <img 
            src={logo} 
            alt="BAYB" 
            className="h-16 mx-auto mb-4 object-contain"
          />
          <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
            <span>{currentQuestion.section}</span>
            <span>Question {currentIndex + 1} of {activeQuestions.length}</span>
          </div>
          <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/20 rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-lg text-white leading-relaxed">
                {currentQuestion.text}
              </p>
            </div>
          </div>

          {!isIntroOrCompletion && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/50 scale-110'
                      : 'bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 shadow-lg shadow-cyan-500/30'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-8 h-8 text-white" />
                  ) : (
                    <Mic className="w-8 h-8 text-white" />
                  )}
                  {isListening && (
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                  )}
                </button>
              </div>

              <AnimatePresence>
                {showTranscript && transcript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-black/40 border border-cyan-500/30 rounded-lg p-4"
                  >
                    <p className="text-sm text-gray-400 mb-1">Your answer:</p>
                    <p className="text-white">{transcript}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {isListening && (
                <p className="text-center text-cyan-400 text-sm animate-pulse">
                  Listening...
                </p>
              )}
            </div>
          )}

          {isSpeaking && (
            <div className="flex items-center justify-center gap-2 text-cyan-400 text-sm mt-4">
              <Volume2 className="w-4 h-4 animate-pulse" />
              <span>BAYB is speaking...</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-8 gap-4">
            <button
              onClick={handleBack}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-700 disabled:hover:text-gray-400"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <button
              onClick={toggleAudio}
              className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
              title={audioEnabled ? 'Mute audio' : 'Unmute audio'}
            >
              {audioEnabled ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={handleNext}
              disabled={!isIntroOrCompletion && !transcript.trim()}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:from-cyan-500 disabled:hover:to-cyan-600"
            >
              {currentIndex >= activeQuestions.length - 1 ? 'Complete' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        <p className="text-center text-gray-500 text-sm mt-4">
          {Math.round(progress)}% complete
        </p>
      </div>
    </div>
  );
}
