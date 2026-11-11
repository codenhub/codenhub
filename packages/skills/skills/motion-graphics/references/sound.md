# Sound

## Contents

- Order Of Work
- The Beat File
- Narration
- Sound Effects
- Music
- Mixing
- Captions
- Checking Sound
- Delivering Sound

The commands use `ffmpeg` and `ffprobe`; another audio tool works when it can place a file at an exact time, measure loudness, and limit peaks.

## Order Of Work

1. Write the narration into the storyboard, one line per beat.
2. Generate each line as its own file and measure it. The measured lengths set the beat durations.
3. Write the beat file, and build the animation from it.
4. Render the frames, then make the sound effects and the mix from the same beat file.
5. Encode, then run the checks in Checking Sound.

Narration recorded after the animation never fits it: a line runs long and is cut, or the picture waits on silence. Changing a spoken line means generating it again, measuring it, and updating the beat file before touching the animation.

## The Beat File

Keep the timing in one data file that both the page and the mix read, so a sound cannot drift from the move it belongs to. Times are in seconds; a cue's `at` is measured from its beat's start.

```json
{
  "fps": 30,
  "beats": [
    {
      "id": "intro",
      "start": 0,
      "duration": 3.4,
      "voice": { "file": "vo/01-intro.wav", "at": 0.5, "text": "CodenHub ships three new packages today." },
      "cues": [{ "at": 0.3, "sound": "whoosh" }]
    }
  ]
}
```

- The page places each scene at its beat's `start`, and each move that has a sound at the cue's time: `master.add(intro(beat), beat.start)`, and inside the scene `tl.from(card, { x: -400 }, cue.at)`.
- The mix places each file at `start + at`. Never type a time into both the page and the mix command.
- Round every `start` and `duration` to a whole number of frames.

## Narration

Use, in this order: recordings the client supplied; the speech tool the environment or the client already has; a local open model, such as Piper; otherwise ask. Do not sign up for a service or send the script to one without being asked, since an unreleased product's script is confidential.

A speech tool fits when it gives one file per line, a voice made for the script's language, a fixed voice that can be used again in a later revision, and a license that covers the client's use. Read the license of the tool and of the voice itself: several open voices are trained on data that forbids commercial use. Record the tool, the voice, and the license in the delivery notes. Never imitate a real person's voice without their written permission.

- **Write for the ear.** Short sentences, one idea each, with the subject first. The narration says what the picture cannot show; it does not read the on-screen text aloud.
- **Plan at 2.5 words per second,** then replace the estimate with the measured length. A beat lasts at least the line's start offset, plus its length, plus 0.3 seconds.
- **Leave air.** Start a line 0.3 to 0.5 seconds into its beat, and keep at least 0.3 seconds between lines. Wall-to-wall speech reads as an advertisement being rushed.
- **Fix pronunciation in the spoken script only.** Respell names, acronyms, versions, and numbers the way they are said, such as "Coden Hub" or "version two point one", and keep the written form for captions and on-screen text.
- **Test foreign words first.** A voice made for one language garbles words from another, such as an English product name in a Portuguese script. Generate one line with every name and borrowed term before the rest, and transcribe it. When a respelling does not fix a word, write the line without it and leave the word to the picture.
- **Keep one voice and one set of settings** for the whole piece. Generate each line once and keep the file; many tools give a different reading on every run, so a regenerated line no longer matches its neighbours.

With Piper, after downloading a voice with `python -m piper.download_voices --download-dir VOICES en_US-lessac-medium`:

```sh
echo "Coden Hub ships three new packages today." | python -m piper -m en_US-lessac-medium --data-dir VOICES -f vo/01-intro.wav
ffprobe -v error -show_entries format=duration -of csv=p=0 vo/01-intro.wav
```

On Windows, set the environment variable `PYTHONUTF8=1` before piping text with accents to a Python tool such as Piper. Without it the text arrives in the system codepage, and the voice reads each accented letter as symbols.

## Sound Effects

A sound effect marks a change the viewer sees: something arrives, leaves, lands, or is pressed. Give sounds to the few moves that carry the beats, usually one or two per beat. A sound on every element is the audio form of decorative motion.

- **Keep one family.** Choose the character from the brand, as with easing: short, dry, high sounds feel technical; soft, low, longer ones feel calm; pitched and bouncy ones feel playful. Use the same few sounds throughout, and vary them only slightly, such as in pitch.
- **Place by the picture.** A whoosh starts with its move and peaks where the move is fastest. An impact or a tick lands on the frame the element arrives. A riser ends on the cut it leads into.
- **Synthesize short sounds.** They need no license and are the same on every render. Use a supplied or licensed library when the brand needs recorded sounds, and record each file's source and license.
- **Use an interface sound only for an interface action,** such as a click when the cursor presses.

Starting points to tune, each written at 48 kHz. Change frequencies, lengths, and decay to fit the family; set the level in the mix, not here.

```sh
# Whoosh: filtered noise that swells and falls. Lower the lowpass for a softer one.
ffmpeg -f lavfi -i "anoisesrc=c=pink:d=0.45:a=0.6:seed=7" -af "highpass=f=500,lowpass=f=6000,afade=t=in:d=0.3:curve=qsin,afade=t=out:st=0.3:d=0.15" -ar 48000 sfx/whoosh.wav

# Tick: a very short high tone, for small arrivals and counters.
ffmpeg -f lavfi -i "aevalsrc='0.6*sin(2*PI*2000*t)*exp(-90*t)':d=0.06:s=48000" sfx/tick.wav

# Pop: a short tone falling in pitch, for elements that appear.
ffmpeg -f lavfi -i "aevalsrc='0.7*sin(2*PI*(500*t-1200*t*t))*exp(-22*t)':d=0.18:s=48000" sfx/pop.wav

# Riser: a tone rising in pitch and level, ending on a cut.
ffmpeg -f lavfi -i "aevalsrc='0.4*sin(2*PI*(180*t+220*t*t))*(t/1.5)^2':d=1.5:s=48000" -af "afade=t=out:st=1.47:d=0.03" sfx/riser.wav

# Impact: a low thump with a burst of noise, for a logo or a headline landing.
ffmpeg -f lavfi -i "aevalsrc='0.9*sin(2*PI*(55*t+40*(1-exp(-12*t))/12))*exp(-5*t)':d=0.9:s=48000" -f lavfi -i "anoisesrc=c=brown:d=0.12:a=0.8:seed=3" -filter_complex "[1]afade=t=out:d=0.12[n];[0][n]amix=inputs=2:normalize=0" -ar 48000 sfx/impact.wav
```

Give noise a fixed `seed`, so a re-render produces the same file.

## Music

Use a track the client supplied or licensed. When there is none, ask for one, and meanwhile deliver the piece with narration and sound effects only, saying so. Do not generate music or take a track from the web unless the client names the tool or the source: the license of generated and found music is often unclear, and a platform can mute or remove a video over it.

- Record the track's title, source, and license in the delivery notes.
- Find the tempo, and place cuts and major changes on beats, as Timing And Easing describes. When the tempo is not given, measure it with a tempo detector, or ask.
- Choose the section of the track that fits the length, start it on a bar, and fade it out over 0.5 to 1 second before the end unless it ends on its own.

## Mixing

Mix to one stereo file at 48 kHz, as long as the video.

- **Voice leads.** Nothing covers a word.
- **Music sits under speech and returns in the gaps.** Lower it by the voice automatically, as the command below does, rather than leaving it at one low level for the whole piece.
- **Sound effects sit below the voice,** about 6 to 10 dB under it, and lower when they fall on a word.
- **Loudness.** Integrated loudness of -14 LUFS, within 1 LU, for web and social video, with peaks at or under -1 dBFS. When the platform or the client specifies another target, such as -23 LUFS for European broadcast, use it.

First build the mix without loudness correction. Delays are in milliseconds, each `start + at` from the beat file:

```sh
ffmpeg -i music.wav -i vo/01-intro.wav -i vo/02-install.wav -i sfx/whoosh.wav -i sfx/impact.wav -filter_complex "
[1]adelay=500:all=1[v1];[2]adelay=4000:all=1[v2];
[v1][v2]amix=inputs=2:normalize=0,aresample=48000,asplit=3[voice][key][stem];
[3]adelay=300:all=1,volume=-8dB[s1];[4]adelay=6800:all=1,volume=-6dB[s2];
[s1][s2]amix=inputs=2:normalize=0[sfx];
[0]volume=-6dB[m];[m][key]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=350[music];
[music][voice][sfx]amix=inputs=3:normalize=0,apad,atrim=duration=DURATION[out]" \
  -map "[out]" -ac 2 premix.wav -map "[stem]" stems/voice.wav
```

- `normalize=0` on every `amix` keeps each layer at the level it was given; without it, the filter lowers every input as inputs are added.
- `DURATION` is the captured frame count divided by the frame rate.
- Without music, leave out its input and the line that builds `[music]`, lower every other input number by one, and end with `[voice][sfx]amix=inputs=2:normalize=0`.
- The delays above are typed to show the shape of the command. For a real piece, write the command from the beat file with a short script, so a changed beat moves its sounds.
- Write a stem for the effects and for the music in the same way when the client will remix or translate the piece.

Then measure the mix, raise or lower it by the difference from the target, and limit the peaks:

```sh
ffmpeg -i premix.wav -af ebur128 -f null - 2>&1 | grep "I:"
ffmpeg -i premix.wav -af "volume=GAINdB,alimiter=limit=-1.5dB:level=0,aresample=48000" mix.wav
```

`GAIN` is the target minus the measured value: a mix measured at -17.3 LUFS takes `volume=3.3dB`. A single-pass loudness normalizer misses the target on a piece this short; measure and apply the gain instead. Measure `mix.wav` again, since the limiter lowers loudness when it has much to catch.

## Captions

Narration needs captions, because most social video plays muted.

- Build captions from the script and the beat file's times, not from a transcription, which gets names wrong.
- Use the written form of each line, not the respelled one.
- Show one or two lines at a time, of at most about 40 characters each, breaking at phrase boundaries, and keep each on screen for as long as it is spoken.
- For social platforms, put captions in the picture, as elements on the timeline inside the safe area, at the body text size Composition gives. For a website or YouTube, deliver an `.srt` or `.vtt` file beside the video instead, unless asked to put them in the picture.

## Checking Sound

You cannot hear the result. Measure what can be measured, and say what was not heard.

- **Stream.** With `ffprobe`, confirm the file has an audio stream at 48 kHz stereo, and that its duration equals the video's.
- **Loudness and peaks.** `ffmpeg -i out.mp4 -map 0:a -af ebur128=peak=true -f null -` prints the integrated loudness and the peak at the end. Compare them with the targets in Mixing.
- **Voice timing.** Find where speech starts and stops in the voice stem, and compare each start with its `start + at` in the beat file; they should agree within two frames. Confirm no line runs past the end of its beat or the end of the file.

  ```sh
  ffmpeg -i stems/voice.wav -af silencedetect=noise=-45dB:d=0.3 -f null - 2>&1 | grep -o "silence_[a-z]*: [0-9.]*"
  ```

- **Words.** Transcribe the voice stem with a speech recognizer and compare it with the script. A missing, repeated, or wrong word means the line is generated again. A recognizer spells names its own way, so a different spelling of a name that sounds the same is not a defect; note it for the listener to confirm.

  ```python
  import subprocess, sys
  import numpy as np
  from faster_whisper import WhisperModel

  # Decode to 16 kHz mono samples, which the model takes directly.
  command = ["ffmpeg", "-nostdin", "-v", "error", "-i", sys.argv[1], "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]
  samples = np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype=np.float32)
  segments, _ = WhisperModel("base", device="cpu", compute_type="int8").transcribe(samples, word_timestamps=True)
  for segment in segments:
      for word in segment.words:
          print(f"{word.start:.2f}\t{word.end:.2f}\t{word.word.strip()}")
  ```

- **Cues.** Draw the mix's waveform at the width of a contact sheet row and set it under the frames: `ffmpeg -i mix.wav -filter_complex "showwavespic=s=2880x160:colors=white" -frames:v 1 wave.png`. Each effect's spike should sit under the frame of its move, and the music should dip under each line.
- **Muted.** Watch the contact sheet with the narration covered: the message must still arrive through the picture, the on-screen text, and the captions.

Whether the voice sounds natural, a name is said correctly, the music suits the brand, and the effects feel right cannot be measured. List these in the delivery notes as checks for a person to make by listening, with the timestamps of the names and the effects.

## Delivering Sound

Beside the video, deliver the mix, the stems, the narration script in its written and spoken forms, the beat file, the caption file when there is one, and a list of every voice, track, and recorded sound with its source and license. Without an encoder, deliver the mix and the frames as Encoding describes.
