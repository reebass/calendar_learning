from flask import Flask, render_template, request, jsonify
import pandas as pd
from openpyxl import load_workbook
from datetime import datetime, time

# Налаштування
EXCEL_FILE_PATH    = 'календарь_обучения.xlsx'
SHEET_TYPES        = 'Вид навчання'
SHEET_TRAINERS     = 'Тренери'
SHEET_ROOMS        = 'Приміщення'
SHEET_PARTICIPANTS = 'Учасники навчання'
SHEET_SCHEDULE     = 'Заплановані навчання'

app = Flask(__name__)

def load_options(sheet_name):
    df = pd.read_excel(EXCEL_FILE_PATH, sheet_name=sheet_name, dtype=str)
    return df.iloc[:,0].dropna().astype(str).tolist()

def load_participants_df():
    return pd.read_excel(EXCEL_FILE_PATH, sheet_name=SHEET_PARTICIPANTS, dtype=str)

def load_schedule_df():
    return pd.read_excel(EXCEL_FILE_PATH, sheet_name=SHEET_SCHEDULE, dtype=str)

@app.route('/')
def schedule_page():
    return render_template('schedule.html')

@app.route('/calendar')
def calendar_page():
    return render_template('calendar.html')

@app.route('/api/options/<opt>')
def api_options(opt):
    if opt=='types':
        return jsonify(load_options(SHEET_TYPES))
    if opt=='trainers':
        return jsonify(load_options(SHEET_TRAINERS))
    if opt=='rooms':
        return jsonify(load_options(SHEET_ROOMS))
    return jsonify([]), 404

@app.route('/api/parse_ids', methods=['POST'])
def api_parse_ids():
    file = request.files.get('file')
    if not file:
        return jsonify({'error':'no file'}), 400
    df = pd.read_excel(file, sheet_name=0, usecols=[0], header=None, dtype=str)
    ids = df.iloc[:,0].dropna().astype(str).tolist()
    return jsonify(ids)

@app.route('/api/schedule', methods=['POST'])
def api_schedule():
    data = request.json
    typ, room, trainer = data['type'], data['room'], data['trainer']
    date, start, end     = data['date'], data['start'], data['end']
    ids_str = data.get('participants','')
    ids = [i.strip() for i in ids_str.split(';') if i.strip()]

    dt_s = datetime.strptime(f"{date} {start}", "%Y-%m-%d %H:%M")
    dt_e = datetime.strptime(f"{date} {end}",   "%Y-%m-%d %H:%M")
    if dt_s.weekday()>4 or dt_s.time()<time(9) or dt_e.time()>time(18):
        return jsonify({'error':'Invalid time/day'}), 400

    sched = load_schedule_df()
    day = sched[sched['Дата']==date]
    for _, r in day.iterrows():
        ex_s = datetime.strptime(r['Початок'], '%H:%M').time()
        ex_e = datetime.strptime(r['Завершення'], '%H:%M').time()
        if r['Приміщення']==room and not (dt_e.time()<=ex_s or dt_s.time()>=ex_e):
            return jsonify({'error':'Room conflict'}), 400
        for pid in ids:
            if pid in str(r['Учасники']).split(';'):
                return jsonify({'error':f'Participant {pid} busy'}), 400

    part_df = load_participants_df()
    names = []
    for pid in ids:
        match = part_df[part_df['ID']==pid]
        if not match.empty:
            names.append(match.iloc[0]['ФІО'])
    names_str = ';'.join(names)

    wb = load_workbook(EXCEL_FILE_PATH)
    ws = wb[SHEET_SCHEDULE]
    ws.append([typ, room, trainer, date, start, end, ids_str, names_str])
    wb.save(EXCEL_FILE_PATH)
    return jsonify({'status':'ok'})

@app.route('/api/events')
def api_events():
    df = load_schedule_df()
    evs = []
    for _, r in df.iterrows():
        evs.append({
            'title': r['Назва'],
            'start': f"{r['Дата']}T{r['Початок']}",
            'end':   f"{r['Дата']}T{r['Завершення']}",
            
            'extendedProps': {
                'participants':    r.get('ПІБ учасників','').split(';'),
                'room': r['Приміщення'],
                'trainer': r['Тренер'],
            }
        })
    return jsonify(evs)

# @app.route('/api/events')
# def api_events():
#     df = load_schedule_df()
#     events = []
#     for _, r in df.iterrows():
#         events.append({
#             'title': r['Назва'],
#             'start': f"{r['Дата']}T{r['Початок']}",
#             'end':   f"{r['Дата']}T{r['Завершення']}",
#             'extendedProps': { 'participants': r['ПІБ учасників'].split(';') }
#         })
#     return jsonify(events)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)


