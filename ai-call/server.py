import sys
import re
from pprint import pprint
from llama_cpp import Llama
import time
from flask import Flask, request, jsonify

app = Flask(__name__)

llm = Llama(
    model_path="Mistral-Nemo-Instruct-2407.Q8_0.gguf",
    chat_format="mistral-instruct",
    n_ctx=32 * 1024,
    n_gpu_layers=-1,  # -1 for GPU, 0 for CPU
    seed=0,
    verbose=False
)

conversation_history = [
    {"role": "system", "content": "Du bist ein Assistent, der Fragen auf Deutsch beantwortet."}
]

@app.route('/ask', methods=['POST'])
def ask_llm():
    global conversation_history

    data = request.get_json()
    if 'question' not in data:
        return jsonify({"error": "No question provided"}), 400

    question = data['question'].strip()
    if not question:
        return jsonify({"error": "Question cannot be empty"}), 400

    conversation_history.append({"role": "user", "content": question})

    t0 = time.time()
    result = llm.create_chat_completion(messages=conversation_history)
    t1 = time.time()

    response_content = result["choices"][0].get("message").get("content")

    conversation_history.append({"role": "assistant", "content": response_content})

    return jsonify({
        "response": response_content,
        "processing_time": t1 - t0
    })

@app.route('/clear', methods=['POST'])
def clear_conversation():
    global conversation_history
    conversation_history = [
        {"role": "system", "content": "Du bist ein Assistent, der Fragen auf Deutsch beantwortet."}
    ]
    return jsonify({"message": "Conversation history cleared."})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)  # Adjust the port if needed