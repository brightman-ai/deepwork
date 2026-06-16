/**
 * @ce-owned SHARED settings sections. Importing this module (side-effect) registers them into
 * the 'settings' slot for whatever host loaded it. The @ce settings portal imports this, so every
 * host that mounts the @ce settings portal gets these for free — defined once, no per-host copy.
 */
import { Globe } from 'lucide-vue-next'
import { definePortalSection } from '@ce/framework/portal'

// Internet Access / Cloudflare tunnel — exposes "this server" to the internet, applicable to the
// standalone terminal AND pro as a whole. Trails host-specific sections (order 100).
definePortalSection({
  slot: 'settings',
  id: 'shared.internet-access',
  group: 'shared',
  label: 'Network',
  icon: Globe,
  order: 100,
  component: () => import('./InternetAccessSection.vue'),
})
