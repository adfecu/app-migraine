Dealing with light sensitivity (photophobia) while trying to collect data is a tricky UX challenge. If a screen—even in dark mode—is painful for the user, you have to move away from visual-heavy interaction.

Here are the best strategies to ensure your users can complete their forms without discomfort:

### 1. Voice-to-Text & Screen Readers

This is the most effective "eyes-free" method. Instead of reading and typing, the user interacts with the app like a conversation.

* **Voice Conversational UI:** Implement a mode where the app reads the question aloud and listens for the answer.
* **Accessibility Labels:** Ensure your form is fully optimized for **iOS VoiceOver** or **Android TalkBack**. This allows users to navigate the form using gestures while keeping their eyes closed.

### 2. Audio-Only "Podcast" Mode

Transform the form into an interactive audio experience.

* **The Flow:** The app plays a prompt (e.g., "On a scale of 1 to 5, how is your pain today?"), and the user responds with a voice command or a physical button click.
* **Haptic Feedback:** Use distinct vibration patterns to confirm that an answer was recorded so the user doesn't have to look at the screen for a "Success" message.

### 3. Extreme Display Customization

If they *must* look at the screen, standard "Dark Mode" isn't enough. You need "Migraine-Friendly" settings:

* **Red Light Filter:** Blue light is the most painful. Providing a dedicated toggle to shift the entire UI to deep red/amber can reduce eye strain significantly.
* **Zero-Contrast Mode:** High contrast (pure white text on pure black) can cause "halation" or glowing effects that hurt sensitive eyes. Use low-contrast pairings like dark grey background with muted charcoal text.
* **Large-Scale Interactions:** Make the "tap targets" the entire screen (e.g., "Tap the top half for Yes, bottom half for No") so they don't have to focus their vision on a specific small button.

### 4. Physical Button Mapping

If your form questions are simple (Yes/No or Scales), allow users to use the **Volume Up/Down buttons** to navigate or select options. This allows them to keep the phone face-down on their chest or a table while still inputting data.

### 5. "Remind Me Later" (Smart Snoozing)

Sometimes the best UI is no UI.

* If a user triggers a "Light Sensitive" state, give them a one-tap option to snooze the form for 2, 4, or 6 hours.
* Data collected during a peak pain event is often less accurate anyway; waiting until the symptoms subside slightly might result in better data.

---

### Comparison of Methods

| Method | Effort to Build | User Comfort | Best For... |
| --- | --- | --- | --- |
| **Voice UI** | High | Excellent | Long forms / open text answers |
| **Haptic/Physical Buttons** | Medium | Good | Simple scales (1-10) or Y/N |
| **Red Light Filter** | Low | Fair | Quick check-ins |
| **Smart Snooze** | Low | Best | When the user is in a "dark room" crisis |

**Would you like me to draft a user flow for how a "Voice-Only" mode would work for one of your specific questions?**