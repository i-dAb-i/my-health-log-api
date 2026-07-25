import os
from datetime import date, timedelta
from typing import Any

import pandas as pd
import requests
import streamlit as st


API_BASE_URL = os.getenv(
    "API_BASE_URL",
    "http://localhost:9090",
).rstrip("/")


st.set_page_config(
    page_title="My Health Log",
    page_icon="🩺",
    layout="wide",
)

def apply_custom_styles() -> None:
    """하늘색/흰색 기반의 전체 UI 스타일을 적용한다."""

    st.markdown(
        """
        <style>
        .stApp {
            background: linear-gradient(180deg, #f7fbff 0%, #eef8ff 100%);
        }

        section[data-testid="stSidebar"] {
            background: linear-gradient(180deg, #dff1ff 0%, #edf8ff 100%);
            border-right: 1px solid #cfe8f7;
        }

        .block-container {
            padding-top: 2rem;
            padding-bottom: 2rem;
        }

        div[data-testid="stMetric"] {
            background: rgba(255, 255, 255, 0.88);
            border: 1px solid #d9eefb;
            border-radius: 18px;
            padding: 16px;
            box-shadow: 0 6px 20px rgba(126, 200, 245, 0.12);
        }

        div[data-testid="stForm"] {
            background: rgba(255, 255, 255, 0.88);
            border: 1px solid #d9eefb;
            border-radius: 18px;
            padding: 20px;
            box-shadow: 0 6px 20px rgba(126, 200, 245, 0.10);
        }

        div[data-testid="stDataFrame"] {
            background: rgba(255, 255, 255, 0.90);
            border-radius: 16px;
            border: 1px solid #d9eefb;
            padding: 8px;
        }

        .stButton > button {
            background: linear-gradient(90deg, #7ec8f5 0%, #a8ddff 100%);
            color: #1f3b52;
            border: none;
            border-radius: 999px;
            font-weight: 600;
            padding: 0.6rem 1rem;
        }

        .stButton > button:hover {
            background: linear-gradient(90deg, #6ec0f1 0%, #95d5fb 100%);
            color: #163246;
        }

        .stDownloadButton > button {
            border-radius: 999px;
        }

        h1, h2, h3 {
            color: #35627d;
        }

        .cloud-card {
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid #d9eefb;
            border-radius: 22px;
            padding: 20px;
            box-shadow: 0 8px 24px rgba(126, 200, 245, 0.10);
            margin-bottom: 16px;
        }

        .section-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #35627d;
            margin-bottom: 0.6rem;
        }

        .soft-caption {
            color: #62839c;
            font-size: 0.95rem;
        }
        /* 사이드바 메뉴 버튼 공통 */
section[data-testid="stSidebar"]
div[data-testid="stButton"] > button {
    width: 100%;
    justify-content: flex-start;
    border-radius: 13px;
    padding: 0.62rem 0.85rem;
    margin-bottom: 0.15rem;
    border: 1px solid transparent;
    box-shadow: none;
    font-weight: 600;
    transition: all 0.18s ease;
}

/* 선택되지 않은 메뉴 */
section[data-testid="stSidebar"]
button[data-testid="stBaseButton-secondary"] {
    background: transparent !important;
    color: #41677f !important;
    border-color: transparent !important;
}

/* 선택되지 않은 메뉴에 마우스를 올렸을 때 */
section[data-testid="stSidebar"]
button[data-testid="stBaseButton-secondary"]:hover {
    background: #d8efff !important;
    color: #27536d !important;
    border-color: #b8dff7 !important;
    transform: translateX(3px);
}

/* 현재 선택된 메뉴 */
section[data-testid="stSidebar"]
button[data-testid="stBaseButton-primary"] {
    background: linear-gradient(
        90deg,
        #72c1f1 0%,
        #9bd9fb 100%
    ) !important;
    color: #ffffff !important;
    border-color: #72c1f1 !important;
    box-shadow: 0 5px 14px rgba(87, 169, 219, 0.22);
}

/* 선택된 메뉴에 마우스를 올렸을 때 */
section[data-testid="stSidebar"]
button[data-testid="stBaseButton-primary"]:hover {
    background: linear-gradient(
        90deg,
        #62b8eb 0%,
        #89d0f8 100%
    ) !important;
    color: #ffffff !important;
    transform: translateX(2px);
}

/* 사이드바 사용자 카드 */
.sidebar-profile-card {
    padding: 18px !important;
    margin-bottom: 14px;
    overflow: hidden;
}

.sidebar-profile-name {
    color: #315f7b;
    font-size: 1.08rem;
    font-weight: 700;
    margin-bottom: 7px;
}

.sidebar-profile-email {
    overflow-wrap: anywhere;
    word-break: break-word;
    line-height: 1.4;
}

.sidebar-profile-role {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #d9eefb;
    font-weight: 600;
}

/* 사이드바 메뉴 버튼 글자 크기 */
section[data-testid="stSidebar"]
button[data-testid="stBaseButton-primary"] p,
section[data-testid="stSidebar"]
button[data-testid="stBaseButton-secondary"] p {
    font-size: 1.05rem !important;
    line-height: 1.4 !important;
    font-weight: 600 !important;
}

/* 메뉴 버튼 높이와 여백 */
section[data-testid="stSidebar"]
div[data-testid="stButton"] > button {
    min-height: 46px;
    padding: 0.7rem 0.9rem !important;
}

        </style>
        """,
        unsafe_allow_html=True,
    )

def initialize_session() -> None:
    """로그인 관련 세션 값을 초기화한다."""

    if "access_token" not in st.session_state:
        st.session_state.access_token = None

    if "current_user" not in st.session_state:
        st.session_state.current_user = None


def api_request(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> requests.Response | None:
    """FastAPI 서버에 요청을 전송한다."""

    headers: dict[str, str] = {}

    if st.session_state.access_token:
        headers["Authorization"] = (
            f"Bearer {st.session_state.access_token}"
        )

    try:
        return requests.request(
            method=method,
            url=f"{API_BASE_URL}{path}",
            headers=headers,
            json=json,
            data=data,
            params=params,
            timeout=15,
        )
    except requests.RequestException as exc:
        st.error(
            "API 서버에 연결할 수 없습니다. "
            f"오류: {exc}"
        )
        return None


def get_error_message(
    response: requests.Response,
) -> str:
    """FastAPI 오류 응답에서 사용자용 메시지를 추출한다."""

    try:
        response_data = response.json()
    except ValueError:
        return response.text or "알 수 없는 오류가 발생했습니다."

    detail = response_data.get(
        "detail",
        "요청을 처리할 수 없습니다.",
    )

    if isinstance(detail, list):
        messages: list[str] = []

        for item in detail:
            location = " → ".join(
                str(value)
                for value in item.get("loc", [])
            )
            message = item.get("msg", "입력값 오류")

            messages.append(
                f"{location}: {message}"
            )

        return "\n".join(messages)

    return str(detail)


def load_current_user() -> dict[str, Any] | None:
    """현재 JWT 토큰의 사용자 정보를 조회한다."""

    response = api_request(
        "GET",
        "/users/me",
    )

    if response is None:
        return None

    if not response.ok:
        return None

    return response.json()


def logout() -> None:
    """로그인 정보를 세션에서 제거한다."""

    st.session_state.access_token = None
    st.session_state.current_user = None
    st.rerun()


def render_auth_screen() -> None:
    """로그인과 회원가입 화면을 표시한다."""

    st.title("🩺 My Health Log")
    st.caption("건강 기록 관리 서비스")

    mode = st.radio(
        "메뉴",
        ["로그인", "회원가입"],
        horizontal=True,
        label_visibility="collapsed",
    )

    if mode == "로그인":
        with st.form("login_form"):
            email = st.text_input(
                "이메일",
                placeholder="user@example.com",
            )
            password = st.text_input(
                "비밀번호",
                type="password",
            )

            submitted = st.form_submit_button(
                "로그인",
                use_container_width=True,
            )

        if submitted:
            response = api_request(
                "POST",
                "/auth/login",
                data={
                    "username": email.strip().lower(),
                    "password": password,
                },
            )

            if response is None:
                return

            if not response.ok:
                st.error(get_error_message(response))
                return

            token_data = response.json()

            st.session_state.access_token = token_data[
                "access_token"
            ]
            st.session_state.current_user = (
                load_current_user()
            )

            if st.session_state.current_user is None:
                st.session_state.access_token = None
                st.error(
                    "로그인 사용자 정보를 가져오지 못했습니다."
                )
                return

            st.success("로그인되었습니다.")
            st.rerun()

    else:
        with st.form("register_form"):
            name = st.text_input("이름")
            email = st.text_input(
                "이메일",
                placeholder="user@example.com",
            )
            password = st.text_input(
                "비밀번호",
                type="password",
                help="8자 이상으로 입력하세요.",
            )
            password_confirm = st.text_input(
                "비밀번호 확인",
                type="password",
            )
            role_label = st.selectbox(
                "가입 유형",
                ["대상자", "보호자"],
            )

            submitted = st.form_submit_button(
                "회원가입",
                use_container_width=True,
            )

        if submitted:
            if password != password_confirm:
                st.error("비밀번호가 일치하지 않습니다.")
                return

            role = (
                "patient"
                if role_label == "대상자"
                else "guardian"
            )

            response = api_request(
                "POST",
                "/auth/register",
                json={
                    "email": email.strip().lower(),
                    "password": password,
                    "name": name.strip(),
                    "role": role,
                },
            )

            if response is None:
                return

            if not response.ok:
                st.error(get_error_message(response))
                return

            created_user = response.json()

            st.success(
                "회원가입이 완료되었습니다. "
                "로그인 메뉴에서 로그인하세요."
            )

            if created_user.get("patient_code"):
                st.info(
                    "대상자 연결 코드: "
                    f"`{created_user['patient_code']}`"
                )


def load_accessible_patients() -> list[dict[str, Any]]:
    """현재 사용자가 접근할 수 있는 대상자를 조회한다."""

    response = api_request(
        "GET",
        "/users/accessible-patients",
    )

    if response is None:
        return []

    if not response.ok:
        st.error(get_error_message(response))
        return []

    return response.json()


def select_patient(
    patients: list[dict[str, Any]],
    *,
    key: str,
    label: str = "대상자",
) -> dict[str, Any] | None:
    """대상자 선택 상자를 만들고 선택 결과를 반환한다."""

    if not patients:
        st.warning("접근 가능한 대상자가 없습니다.")
        return None

    patient_options = {
        (
            f"{patient['name']} "
            f"({patient['email']}, ID {patient['id']})"
        ): patient
        for patient in patients
    }

    selected_label = st.selectbox(
        label,
        list(patient_options.keys()),
        key=key,
    )

    return patient_options[selected_label]


def render_dataframe(
    records: list[dict[str, Any]],
) -> None:
    """건강 기록 목록을 읽기 쉬운 표로 표시한다."""

    if not records:
        st.info("표시할 건강 기록이 없습니다.")
        return

    dataframe = pd.DataFrame(records)

    preferred_columns = [
        "id",
        "user_id",
        "created_by_user_id",
        "date",
        "weight",
        "height",
        "bmi",
        "bmi_category",
        "systolic",
        "diastolic",
        "bp_category",
        "blood_sugar",
        "sugar_category",
        "steps",
        "step_grade",
        "sleep_hours",
        "memo",
    ]

    existing_columns = [
        column
        for column in preferred_columns
        if column in dataframe.columns
    ]

    st.dataframe(
        dataframe[existing_columns],
        width="stretch",
        hide_index=True,
    )

def render_seven_day_trends(
    records: list[dict[str, Any]],
) -> None:
    """최근 7일 건강 기록을 항목별 그래프로 표시한다."""

    st.subheader("최근 7일 건강 추이")

    if not records:
        st.info("최근 7일간 등록된 건강 기록이 없습니다.")
        return

    dataframe = pd.DataFrame(records)

    if "date" not in dataframe.columns:
        st.info("건강 기록에 날짜 정보가 없습니다.")
        return

    dataframe["date"] = pd.to_datetime(
        dataframe["date"],
        errors="coerce",
    )

    dataframe = dataframe.dropna(
        subset=["date"],
    )

    today = pd.Timestamp(date.today())
    seven_days_ago = today - pd.Timedelta(days=6)

    recent_data = dataframe[
        (dataframe["date"] >= seven_days_ago)
        & (dataframe["date"] <= today)
    ].copy()

    if recent_data.empty:
        st.info("최근 7일간 등록된 건강 기록이 없습니다.")
        return

    recent_data = (
        recent_data
        .sort_values("date")
        .groupby("date", as_index=False)
        .agg(
            {
                "weight": "mean",
                "bmi": "mean",
                "systolic": "mean",
                "diastolic": "mean",
                "blood_sugar": "mean",
                "steps": "mean",
                "sleep_hours": "mean",
            }
        )
    )

    recent_data["날짜"] = recent_data[
        "date"
    ].dt.strftime("%m/%d")

    recent_data = recent_data.set_index("날짜")

    if len(recent_data) == 1:
        st.info(
            "최근 7일 기록이 1건이므로 선 대신 "
            "단일 막대로 표시합니다."
        )

    def show_chart(
        chart_data: pd.DataFrame,
    ) -> None:
        if len(chart_data) == 1:
            st.bar_chart(chart_data)
        else:
            st.line_chart(chart_data)

    tabs = st.tabs(
        [
            "체중·BMI",
            "혈압",
            "혈당",
            "걸음 수",
            "수면",
        ]
    )

    with tabs[0]:
        show_chart(
            recent_data[
                ["weight", "bmi"]
            ].rename(
                columns={
                    "weight": "체중(kg)",
                    "bmi": "BMI",
                }
            )
        )

    with tabs[1]:
        show_chart(
            recent_data[
                ["systolic", "diastolic"]
            ].rename(
                columns={
                    "systolic": "수축기 혈압",
                    "diastolic": "이완기 혈압",
                }
            )
        )

    with tabs[2]:
        show_chart(
            recent_data[
                ["blood_sugar"]
            ].rename(
                columns={
                    "blood_sugar": "혈당",
                }
            )
        )

    with tabs[3]:
        show_chart(
            recent_data[
                ["steps"]
            ].rename(
                columns={
                    "steps": "걸음 수",
                }
            )
        )

    with tabs[4]:
        show_chart(
            recent_data[
                ["sleep_hours"]
            ].rename(
                columns={
                    "sleep_hours": "수면 시간",
                }
            )
        )


def render_dashboard() -> None:
    """로그인 사용자의 건강 기록 요약을 표시한다."""

    user = st.session_state.current_user
    patients = load_accessible_patients()

    records_response = api_request(
        "GET",
        "/records",
    )

    records: list[dict[str, Any]] = []

    if (
        records_response is not None
        and records_response.ok
    ):
        records = records_response.json().get(
            "records",
            [],
        )

    role_names = {
        "patient": "대상자",
        "guardian": "보호자",
        "admin": "관리자",
    }

    st.header("대시보드")
    st.markdown(
    """
    <div class="cloud-card">
        <div class="section-title">오늘의 건강 관리</div>
        <div class="soft-caption">
            나의 건강 기록을 확인하고, 통계와 주간 리포트를 한눈에 살펴보세요.
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)
    metric_columns = st.columns(3)

    metric_columns[0].metric(
        "사용자 역할",
        role_names.get(
            user["role"],
            user["role"],
        ),
    )
    metric_columns[1].metric(
        "접근 가능한 대상자",
        len(patients),
    )
    metric_columns[2].metric(
        "조회 가능한 기록",
        len(records),
    )

    if user["role"] == "patient":
        patient_code = user.get("patient_code")

        if patient_code:
            st.info(
                "보호자에게 전달할 대상자 연결 코드: "
                f"`{patient_code}`"
            )

    st.subheader("최근 건강 기록")

    render_dataframe(
        records[:10]
    )

def validate_health_record_input(
    *,
    record_date: date,
    weight: float,
    height: float,
    systolic: int,
    diastolic: int,
    blood_sugar: int,
    steps: int,
    sleep_hours: float,
) -> list[str]:
    """건강 기록 입력값의 허용 범위를 검사한다."""

    errors: list[str] = []

    if record_date > date.today():
        errors.append(
            "기록 날짜는 오늘 이후일 수 없습니다."
        )

    if not 20 <= weight <= 300:
        errors.append(
            "체중은 20kg 이상 300kg 이하여야 합니다."
        )

    if not 50 <= height <= 250:
        errors.append(
            "키는 50cm 이상 250cm 이하여야 합니다."
        )

    if not 60 <= systolic <= 250:
        errors.append(
            "수축기 혈압은 60 이상 250 이하여야 합니다."
        )

    if not 30 <= diastolic <= 150:
        errors.append(
            "이완기 혈압은 30 이상 150 이하여야 합니다."
        )

    if systolic <= diastolic:
        errors.append(
            "수축기 혈압은 이완기 혈압보다 높아야 합니다."
        )

    if not 40 <= blood_sugar <= 500:
        errors.append(
            "혈당은 40 이상 500 이하여야 합니다."
        )

    if not 0 <= steps <= 100000:
        errors.append(
            "걸음 수는 0 이상 100,000 이하여야 합니다."
        )

    if not 0 <= sleep_hours <= 24:
        errors.append(
            "수면 시간은 0시간 이상 24시간 이하여야 합니다."
        )

    return errors

def render_record_create() -> None:
    """건강 기록 입력 화면을 표시한다."""

    st.header("건강 기록 입력")

    patients = load_accessible_patients()
    selected_patient = select_patient(
        patients,
        key="create_patient",
    )

    if selected_patient is None:
        return

    with st.form("record_create_form"):
        record_date = st.date_input(
            "기록 날짜",
            value=date.today(),
            max_value=date.today(),
        )

        first_row = st.columns(2)

        weight = first_row[0].number_input(
            "체중(kg)",
            min_value=20.0,
            max_value=300.0,
            value=65.0,
            step=0.1,
        )
        height = first_row[1].number_input(
            "키(cm)",
            min_value=50.0,
            max_value=250.0,
            value=165.0,
            step=0.1,
        )

        second_row = st.columns(2)

        systolic = second_row[0].number_input(
            "수축기 혈압",
            min_value=60,
            max_value=250,
            value=120,
            step=1,
        )
        diastolic = second_row[1].number_input(
            "이완기 혈압",
            min_value=30,
            max_value=150,
            value=80,
            step=1,
        )

        third_row = st.columns(3)

        blood_sugar = third_row[0].number_input(
            "혈당",
            min_value=40,
            max_value=500,
            value=95,
            step=1,
        )
        steps = third_row[1].number_input(
            "걸음 수",
            min_value=0,
            max_value=100000,
            value=8000,
            step=100,
        )
        sleep_hours = third_row[2].number_input(
            "수면 시간",
            min_value=0.0,
            max_value=24.0,
            value=7.0,
            step=0.5,
        )

        memo = st.text_area(
            "메모",
            max_chars=500,
        )

        submitted = st.form_submit_button(
            "건강 기록 저장",
            use_container_width=True,
        )

    if submitted:
        validation_errors = validate_health_record_input(
            record_date=record_date,
            weight=weight,
            height=height,
            systolic=systolic,
            diastolic=diastolic,
            blood_sugar=blood_sugar,
            steps=steps,
            sleep_hours=sleep_hours,
        )

        if validation_errors:
            for error_message in validation_errors:
                st.error(error_message)

            return

        payload = {
            "user_id": selected_patient["id"],
            "date": record_date.isoformat(),
            "weight": weight,
            "height": height,
            "systolic": systolic,
            "diastolic": diastolic,
            "blood_sugar": blood_sugar,
            "steps": steps,
            "sleep_hours": sleep_hours,
            "memo": memo.strip() or None,
        }

        response = api_request(
            "POST",
            "/records",
            json=payload,
        )

        if response is None:
            return

        if not response.ok:
            st.error(get_error_message(response))
            return

        created_record = response.json()

        st.success(
            f"건강 기록이 저장되었습니다. "
            f"기록 ID: {created_record['id']}"
        )

        warnings = created_record.get(
            "warnings",
            [],
        )

        for warning in warnings:
            st.warning(warning)


def render_records() -> None:
    """건강 기록 조회와 삭제 화면을 표시한다."""

    st.header("건강 기록 조회")

    patients = load_accessible_patients()
    selected_patient = select_patient(
        patients,
        key="record_list_patient",
    )

    if selected_patient is None:
        return

    use_date_filter = st.checkbox(
        "기간을 지정해서 검색",
    )

    params: dict[str, Any] = {
        "user_id": selected_patient["id"],
    }
    endpoint = "/records"

    if use_date_filter:
        date_columns = st.columns(2)

        start_date = date_columns[0].date_input(
            "시작일",
            value=date.today() - timedelta(days=30),
            key="search_start",
        )
        end_date = date_columns[1].date_input(
            "종료일",
            value=date.today(),
            max_value=date.today(),
            key="search_end",
        )

        if start_date > end_date:
            st.error(
                "시작일은 종료일보다 늦을 수 없습니다."
            )
            return

        endpoint = "/search"
        params.update(
            {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            }
        )

    response = api_request(
        "GET",
        endpoint,
        params=params,
    )

    if response is None:
        return

    if not response.ok:
        st.error(get_error_message(response))
        return

    records = response.json().get(
        "records",
        [],
    )

    st.markdown(
        f"""
        <div class="cloud-card">
            <div class="section-title">조회 결과</div>
            <div class="soft-caption">
                총 {len(records)}개의 건강 기록이 조회되었습니다.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    render_dataframe(records)
    render_dataframe(records)
    render_seven_day_trends(records)

    if records:
        st.divider()
        st.subheader("기록 삭제")

        record_options = {
            (
                f"ID {record['id']} · "
                f"{record['date']}"
            ): record["id"]
            for record in records
        }

        selected_record_label = st.selectbox(
            "삭제할 기록",
            list(record_options.keys()),
        )

        confirm_delete = st.checkbox(
            "선택한 기록을 삭제하는 데 동의합니다.",
        )

        if st.button(
            "기록 삭제",
            type="primary",
            disabled=not confirm_delete,
        ):
            record_id = record_options[
                selected_record_label
            ]

            delete_response = api_request(
                "DELETE",
                f"/records/{record_id}",
            )

            if delete_response is None:
                return

            if not delete_response.ok:
                st.error(
                    get_error_message(delete_response)
                )
                return

            st.success("건강 기록이 삭제되었습니다.")
            st.rerun()


def render_stats() -> None:
    """선택한 대상자의 통계와 최근 7일 추이를 표시한다."""

    st.header("건강 통계")

    st.markdown(
        """
        <div class="cloud-card">
            <div class="section-title">건강 통계 요약</div>
            <div class="soft-caption">
                선택한 대상자의 평균 건강 지표와
                최근 7일간의 변화를 확인할 수 있어요.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    patients = load_accessible_patients()
    selected_patient = select_patient(
        patients,
        key="stats_patient",
    )

    if selected_patient is None:
        return

    stats_response = api_request(
        "GET",
        "/stats",
        params={
            "user_id": selected_patient["id"],
        },
    )

    if stats_response is None:
        return

    if not stats_response.ok:
        st.error(
            get_error_message(stats_response)
        )
        return

    stats = stats_response.json()

    first_row = st.columns(3)

    first_row[0].metric(
        "기록 수",
        stats.get("record_count", 0),
    )
    first_row[1].metric(
        "평균 BMI",
        stats.get("average_bmi")
        if stats.get("average_bmi") is not None
        else "-",
    )
    first_row[2].metric(
        "평균 걸음 수",
        stats.get("average_steps")
        if stats.get("average_steps") is not None
        else "-",
    )

    second_row = st.columns(4)

    second_row[0].metric(
        "평균 수축기 혈압",
        stats.get("average_systolic")
        if stats.get("average_systolic") is not None
        else "-",
    )
    second_row[1].metric(
        "평균 이완기 혈압",
        stats.get("average_diastolic")
        if stats.get("average_diastolic") is not None
        else "-",
    )
    second_row[2].metric(
        "평균 혈당",
        stats.get("average_blood_sugar")
        if stats.get("average_blood_sugar") is not None
        else "-",
    )
    second_row[3].metric(
        "평균 수면 시간",
        stats.get("average_sleep_hours")
        if stats.get("average_sleep_hours") is not None
        else "-",
    )

    st.divider()

    records_response = api_request(
        "GET",
        "/records",
        params={
            "user_id": selected_patient["id"],
        },
    )

    if records_response is None:
        return

    if not records_response.ok:
        st.error(
            get_error_message(records_response)
        )
        return

    records = records_response.json().get(
        "records",
        [],
    )

    render_seven_day_trends(records)

def render_weekly_report() -> None:
    """대상자의 주간 건강 리포트를 보기 쉬운 카드 형태로 표시한다."""

    st.header("주간 리포트")

    st.markdown(
        """
        <div class="cloud-card">
            <div class="section-title">주간 건강 변화 요약</div>
            <div class="soft-caption">
                최근 7일과 직전 7일을 비교해 건강 상태 변화를 쉽게 확인할 수 있어요.
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    patients = load_accessible_patients()
    selected_patient = select_patient(
        patients,
        key="weekly_patient",
    )

    if selected_patient is None:
        return

    report_end_date = st.date_input(
        "리포트 종료일",
        value=date.today(),
        max_value=date.today(),
    )

    if st.button(
        "주간 리포트 조회",
        use_container_width=True,
    ):
        response = api_request(
            "GET",
            "/weekly-report",
            params={
                "user_id": selected_patient["id"],
                "end": report_end_date.isoformat(),
            },
        )

        if response is None:
            return

        if not response.ok:
            st.error(get_error_message(response))
            return

        report = response.json()

        current_week = (
            report.get("current_week")
            or report.get("recent_week")
            or report.get("current_period")
            or {}
        )
        previous_week = (
            report.get("previous_week")
            or report.get("previous_period")
            or {}
        )
        changes = report.get("changes") or {}
        summary = report.get("summary") or report.get("comment") or ""

        st.subheader("한눈에 보는 요약")

        if summary:
            st.markdown(
                f"""
                <div class="cloud-card">
                    <div class="section-title">리포트 요약</div>
                    <div class="soft-caption">{summary}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

        metric_labels = {
            "average_weight": "평균 체중",
            "average_bmi": "평균 BMI",
            "average_systolic": "평균 수축기 혈압",
            "average_diastolic": "평균 이완기 혈압",
            "average_blood_sugar": "평균 혈당",
            "average_steps": "평균 걸음 수",
            "average_sleep_hours": "평균 수면 시간",
            "record_count": "기록 수",
        }

        st.subheader("최근 7일 주요 지표")

        metric_keys = [
            "record_count",
            "average_weight",
            "average_bmi",
            "average_steps",
            "average_sleep_hours",
            "average_systolic",
            "average_diastolic",
            "average_blood_sugar",
        ]

        cols = st.columns(4)

        for index, key in enumerate(metric_keys):
            value = current_week.get(key)
            delta = changes.get(key)

            display_value = "-" if value is None else value
            display_delta = None if delta is None else str(delta)

            cols[index % 4].metric(
                metric_labels.get(key, key),
                display_value,
                display_delta,
            )

        compare_col1, compare_col2 = st.columns(2)

        with compare_col1:
            st.markdown(
                """
                <div class="cloud-card">
                    <div class="section-title">최근 7일</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if current_week:
                current_df = pd.DataFrame(
                    [
                        {
                            "항목": metric_labels.get(k, k),
                            "값": v,
                        }
                        for k, v in current_week.items()
                    ]
                )
                st.dataframe(
                    current_df,
                    width="stretch",
                    hide_index=True,
                )
            else:
                st.info("최근 7일 데이터가 없습니다.")

        with compare_col2:
            st.markdown(
                """
                <div class="cloud-card">
                    <div class="section-title">직전 7일</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            if previous_week:
                previous_df = pd.DataFrame(
                    [
                        {
                            "항목": metric_labels.get(k, k),
                            "값": v,
                        }
                        for k, v in previous_week.items()
                    ]
                )
                st.dataframe(
                    previous_df,
                    width="stretch",
                    hide_index=True,
                )
            else:
                st.info("직전 7일 데이터가 없습니다.")

        with st.expander("원본 리포트 데이터 보기"):
            st.json(report)


def render_guardian_links() -> None:
    """보호자 연결 요청과 승인 화면을 표시한다."""

    user = st.session_state.current_user
    role = user["role"]

    st.header("보호자 연결 관리")

    if role == "guardian":
        st.subheader("새 연결 요청")

        with st.form("guardian_link_form"):
            patient_code = st.text_input(
                "대상자 연결 코드",
                placeholder="예: A1B2C3D4",
            )
            relation_type = st.text_input(
                "관계",
                placeholder="부모, 자녀, 배우자, 간병인 등",
            )

            submitted = st.form_submit_button(
                "연결 요청",
                use_container_width=True,
            )

        if submitted:
            response = api_request(
                "POST",
                "/guardian-links",
                json={
                    "patient_code": (
                        patient_code.strip().upper()
                    ),
                    "relation_type": (
                        relation_type.strip() or None
                    ),
                },
            )

            if response is None:
                return

            if not response.ok:
                st.error(get_error_message(response))
            else:
                st.success(
                    "대상자에게 연결 승인을 요청했습니다."
                )
                st.rerun()

    response = api_request(
        "GET",
        "/guardian-links",
    )

    if response is None:
        return

    if not response.ok:
        st.error(get_error_message(response))
        return

    links = response.json()

    st.subheader("연결 요청 목록")

    if not links:
        st.info("보호자 연결 요청이 없습니다.")
        return

    st.dataframe(
        pd.DataFrame(links),
        width="stretch",
        hide_index=True,
    )

    if role not in {"patient", "admin"}:
        return

    pending_links = [
        link
        for link in links
        if link.get("status") == "pending"
    ]

    if not pending_links:
        st.info("처리할 대기 요청이 없습니다.")
        return

    st.subheader("대기 요청 처리")

    for link in pending_links:
        action_columns = st.columns([5, 1, 1])

        action_columns[0].write(
            f"연결 ID {link['id']} · "
            f"보호자 ID {link['guardian_id']} · "
            f"대상자 ID {link['patient_id']} · "
            f"관계: {link.get('relation_type') or '-'}"
        )

        if action_columns[1].button(
            "승인",
            key=f"approve_link_{link['id']}",
        ):
            approve_response = api_request(
                "PATCH",
                (
                    f"/guardian-links/"
                    f"{link['id']}/status"
                ),
                json={
                    "status": "approved",
                },
            )

            if (
                approve_response is not None
                and approve_response.ok
            ):
                st.success("연결 요청을 승인했습니다.")
                st.rerun()

            if approve_response is not None:
                st.error(
                    get_error_message(approve_response)
                )

        if action_columns[2].button(
            "거절",
            key=f"reject_link_{link['id']}",
        ):
            reject_response = api_request(
                "PATCH",
                (
                    f"/guardian-links/"
                    f"{link['id']}/status"
                ),
                json={
                    "status": "rejected",
                },
            )

            if (
                reject_response is not None
                and reject_response.ok
            ):
                st.success("연결 요청을 거절했습니다.")
                st.rerun()

            if reject_response is not None:
                st.error(
                    get_error_message(reject_response)
                )


def render_admin_users() -> None:
    """관리자가 전체 사용자 목록을 조회한다."""

    st.header("전체 사용자 관리")

    response = api_request(
        "GET",
        "/users",
    )

    if response is None:
        return

    if not response.ok:
        st.error(get_error_message(response))
        return

    users = response.json()

    if not users:
        st.info("등록된 사용자가 없습니다.")
        return

    st.dataframe(
        pd.DataFrame(users),
        width="stretch",
        hide_index=True,
    )

def render_application() -> None:
    """로그인 사용자의 역할에 맞는 화면을 구성한다."""

    user = st.session_state.current_user
    role = user["role"]

    role_names = {
        "patient": "대상자",
        "guardian": "보호자",
        "admin": "관리자",
    }

    st.sidebar.markdown("## ☁️ My Health Log")

    with st.sidebar.container(border=True):
        st.markdown(f"### {user['name']}")
        st.caption(user["email"])
        st.markdown(
            f"**역할:** {role_names.get(role, role)}"
        )

    if st.sidebar.button(
        "로그아웃",
        key="logout_button",
        use_container_width=True,
    ):
        logout()

    st.sidebar.divider()
    st.sidebar.markdown("### 메뉴")

    menu_functions = {
        "☁️ 대시보드": render_dashboard,
        "📝 건강 기록 입력": render_record_create,
        "📋 기록 조회": render_records,
        "📊 건강 통계": render_stats,
        "📅 주간 리포트": render_weekly_report,
        "🔗 보호자 연결 관리": render_guardian_links,
    }

    if role == "admin":
        menu_functions["👥 사용자 관리"] = render_admin_users

    menu_names = list(menu_functions.keys())

    selected_menu = st.session_state.get(
        "selected_sidebar_menu",
        menu_names[0],
    )

    if selected_menu not in menu_functions:
        selected_menu = menu_names[0]
        st.session_state["selected_sidebar_menu"] = selected_menu

    for index, menu_name in enumerate(menu_names):
        is_selected = selected_menu == menu_name

        if st.sidebar.button(
            menu_name,
            key=f"sidebar_menu_{index}",
            type="primary" if is_selected else "secondary",
            use_container_width=True,
        ):
            st.session_state["selected_sidebar_menu"] = menu_name
            st.rerun()

    selected_menu = st.session_state.get(
        "selected_sidebar_menu",
        menu_names[0],
    )

    selected_function = menu_functions[selected_menu]
    selected_function()

apply_custom_styles()
initialize_session()

if st.session_state.access_token:
    if st.session_state.current_user is None:
        st.session_state.current_user = load_current_user()

    if st.session_state.current_user is None:
        st.session_state.access_token = None

if not st.session_state.access_token:
    render_auth_screen()
    st.stop()

render_application()