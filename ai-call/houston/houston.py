import subprocess
import re
import requests
import os
import pyttsx3
import time

# TTS
engine = pyttsx3.init()
# voices = engine.getProperty('voices')
engine.setProperty('voice', 'com.apple.voice.compact.de-DE.Anna')
engine.setProperty('rate', 190)
engine.setProperty('volume', 1)

# MIC MUTE
def mute_mic():
    # This AppleScript command sets the input volume (microphone volume) to 0
    os.system("osascript -e 'set volume input volume 0'")
def unmute_mic(volume=50):
    # This AppleScript command sets the input volume (microphone volume) to a specified value
    os.system(f"osascript -e 'set volume input volume {volume}'")


# SERAFIM FRONTEND API
url = 'http://192.168.101.51:3000/api/message'
def send_bot_message(text):
    payload = {'type': 'newText', 'textType': 'bot', 'text': text}
    requests.post(url, json=payload)
def send_person_message(text):
    payload = {'type': 'newText', 'textType': 'person', 'text': text}
    requests.post(url, json=payload)
def send_recognized_data(info):
    payload = {'type': 'dataRecognized', 'info': info}
    requests.post(url, json=payload)
def reset_detected_info():
    payload = {'type': 'resetInfo'}
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        print("Detected info box reset successfully.")
    else:
        print("Failed to reset detected info box:", response.text)

# LLM API
def query_mistral(question):
    url = "http://65.108.32.143:5000/ask"
    headers = {"Content-Type": "application/json"}
    data = {"question": question}
    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 200:
        json_data = response.json()  # Parse JSON response
        return json_data.get("response", "No response key found") 
    else:
        return {"error": "Request failed", "status_code": response.status_code}
def clear_mistral():
    url = "http://65.108.32.143:5000/clear"
    response = requests.post(url)
    print(response)


def have_common_prefix_over_10_chars(str1, str2):
    min_length = min(len(str1), len(str2))
    match_length = 0
    for i in range(min_length):
        if str1[i] == str2[i]:
            match_length += 1
            if match_length >= 10:
                return True 
        else:
            break
    return False

def remove_text_inside_any_brackets(text):
    # This pattern finds any substring inside (), {}, [], or ** **, or * *
    return re.sub(r"[\(\[\{].*?[\)\]\}]|\*\*.*?\*\*|\*.*?\*", "", text)

def append_without_duplicate(main_str, append_str):
    # Find the longest matching suffix of `main_str` and prefix of `append_str`
    overlap_len = 0
    min_len = min(len(main_str), len(append_str)) 
    for i in range(1, min_len + 1):
        if main_str[-i:] == append_str[:i]:
            overlap_len = i
    return main_str + append_str[overlap_len:]

last = b''
query = "Halte dich kurz. Du nimmst eine Terminvormerkung für einen Krankentransport telefonisch entgegen. \
        Du benötigst Vor/Nachname und Adresse der zu transportierenden Person, und Zielkrankenhaus \
        sowie Datum und Uhrzeit des Krankenhaustermins. Erhältst du nicht alle informationen, \
        frage nach, bis du alle Informationen hast. Erst und ausschließlich erst dann antworte \
        mit der exakten Syntax 'OVER|<Vor- und Nachname>|<Adresse>|<Krankenhaus>|<Datum>|<Uhrzeit>'.\
        Beende dein Gespräch auf keinen Fall, wenn du nicht bereits Name, Adresse, Krankenhaus, Datum und Uhrzeit hast.\
        Füge KEINEN Dank- oder Abschlussatz zu dieser Antwort hinzu. Erfinde keine Daten, Erfinde\
        keine Nachrichten des Benutzers. Bedenke, dass du Eingaben über\
        Spracherkennung erhältst und Sätze möglicherweise abgeschnitten oder falsch transkribiert\
        werden. Wenn du dich nicht in der Lage siehst, die Daten erfolgreich aufnehmen zu können,\
        antworte nur mit der exakten Syntax 'HELP', und der Anruf wird an einen menschlichen Assistenten weitergeleitet.\
        Nimm nun den Höhrer ab und grüße den Anrufer.\n\n"

reset_detected_info()
print(clear_mistral())
resp = query_mistral(query)

append = None
ignore = False

print(resp)
send_bot_message(resp)
engine.say(resp)
engine.runAndWait()

with subprocess.Popen(
    ["./stream", "-m","./models/ggml-medium.bin","-t","8","-l","de","--vad-thold","0.8", "-kc"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
    ) as process:
    for line in process.stdout:
        if line:
            if line.startswith("init") or line.startswith("whisper") or line.startswith("ggml") or line.startswith("main"):
                print(line.strip())
                continue
            line = line.strip()
            line = remove_text_inside_any_brackets(line)
            bline = str.encode(line)
            if len(bline) < 4: continue
            if bline ==  b'\x1b[2K': continue
            if bline[0] == b'[': continue
            if bline[0] == b'(': continue
            if bline.endswith(b'\x1b[2K'): continue
            if bline == b'Vielen Dank.': continue
            if bline == b'Vielen Dank f\xc3\xbcr die Aufmerksamkeit.': continue
            
            # dont repeat yourself dumbass
            if bline == last: continue
            if have_common_prefix_over_10_chars(last, bline): continue
            last = bline

            bline = bline.strip()
            if bline == b'': continue
            line = str(bline.decode())

            # if line.endswith("..."):
            #     append = line
            # if append is not None:
            #     line = append_without_duplicate(append, line)
            #     append = None

            # if ignore:
            #     ignore = False
            #     continue

            mute_mic()


            send_person_message(line.lstrip("[DU]: ").lstrip("[PATIENT]: ").lstrip("[DU]: ").lstrip("[PATIENT]: "))
            print("> Whisper STT: " + line)
            answer = query_mistral(line)
            if "HELP" in answer:
                print("<AI REQUESTED HELP OF HUMAN OPERATOR>")
                send_bot_message("<AI REQUESTED HELP OF HUMAN OPERATOR>")
                break
            if "OVER" in answer:
                information = answer.split("|")
                if len(information) != 6:
                    print("LLM FUCKED UP: answer: " + answer)
                    break
                send_bot_message("<AI HAS OBTAINED ALL INFORMATION>")
                print("<AI HAS OBTAINED ALL INFORMATION>")
                print(information)
                send_recognized_data(information[1])
                send_recognized_data(information[2])
                send_recognized_data(information[3])
                send_recognized_data(information[4])
                send_recognized_data(information[5])
                break

            send_bot_message(answer.lstrip("[DU]: ").lstrip("[PATIENT]: ").lstrip("[DU]: ").lstrip("[PATIENT]: "))
            print("Bot response: " + answer)
 
            engine.say(answer)
            engine.runAndWait()
            time.sleep(0.5)
            ignore = True
            unmute_mic()
            time.sleep(0.5)

        else:
            break

clear_mistral()
unmute_mic()

