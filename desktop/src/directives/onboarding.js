// Onboarding transcript directive registrations. The flow uses one card directive
// per beat so the agent can drop each into the Welcome chat as the beat arrives.
import { jsx } from 'react/jsx-runtime'
import { OnboardingBotsCard, OnboardingFitCard, OnboardingNeedsCard, OnboardingTeamCard, OnboardingTypeCard } from '../components/onboarding-cards.js'

// Array of ctx.registerMany entries keyed by a stable id. Consumers spread this.
export const onboardingDirectives = [
  { id: 'dir-onb-type', area: 'transcript.directives', data: { name: 'flowershop-onboarding-type', render: p => jsx(OnboardingTypeCard, { streaming: !!(p && p.streaming) }) } },
  { id: 'dir-onb-needs', area: 'transcript.directives', data: { name: 'flowershop-onboarding-needs', render: p => jsx(OnboardingNeedsCard, { streaming: !!(p && p.streaming) }) } },
  { id: 'dir-onb-team', area: 'transcript.directives', data: { name: 'flowershop-onboarding-team', render: p => jsx(OnboardingTeamCard, { streaming: !!(p && p.streaming) }) } },
  { id: 'dir-onb-bots', area: 'transcript.directives', data: { name: 'flowershop-onboarding-bots', render: p => jsx(OnboardingBotsCard, { streaming: !!(p && p.streaming) }) } },
  { id: 'dir-onb-fit', area: 'transcript.directives', data: { name: 'flowershop-onboarding-fit', render: p => jsx(OnboardingFitCard, { streaming: !!(p && p.streaming) }) } }
]