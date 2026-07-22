from typing import TypedDict


class HealthAnalysisResult(TypedDict):
    bmi: float
    bmi_category: str
    bp_category: str
    sugar_category: str
    step_grade: str
    warnings: list[str]


def calculate_bmi(weight: float, height: float) -> float:
    """
    몸무게와 키를 사용해 BMI를 계산한다.

    BMI = 몸무게(kg) / 키(m)^2
    """

    height_in_meters = height / 100
    bmi = weight / (height_in_meters ** 2)

    return round(bmi, 2)


def classify_bmi(bmi: float) -> str:
    """BMI 수치에 따른 상태를 반환한다."""

    if bmi < 18.5:
        return "저체중"

    if bmi < 23:
        return "정상"

    if bmi < 25:
        return "과체중"

    return "비만"


def classify_blood_pressure(
    systolic: int,
    diastolic: int,
) -> str:
    """수축기·이완기 혈압에 따른 상태를 반환한다."""

    # 고혈압 조건을 먼저 검사해야 한다.
    if systolic >= 140 or diastolic >= 90:
        return "고혈압"

    if systolic < 120 and diastolic < 80:
        return "정상"

    return "주의"


def classify_blood_sugar(blood_sugar: int) -> str:
    """공복 혈당에 따른 상태를 반환한다."""

    if blood_sugar < 100:
        return "정상"

    if blood_sugar <= 125:
        return "공복혈당장애"

    return "당뇨 의심"


def classify_steps(steps: int) -> str:
    """
    걸음 수 활동 등급을 반환한다.

    프로젝트에서 단순화하여 정한 기준:
    - 5,000보 미만: 부족
    - 5,000보 이상 10,000보 미만: 적정
    - 10,000보 이상: 우수
    """

    if steps < 5000:
        return "부족"

    if steps < 10000:
        return "적정"

    return "우수"


def create_warnings(
    bmi_category: str,
    bp_category: str,
    sugar_category: str,
) -> list[str]:
    """건강 상태에 따라 경고 메시지 목록을 생성한다."""

    warnings: list[str] = []

    if bmi_category == "비만":
        warnings.append(
            "BMI가 비만 범위입니다. 식습관과 활동량을 확인하세요."
        )

    if bp_category == "고혈압":
        warnings.append(
            "혈압이 고혈압 범위입니다. 지속될 경우 전문가와 상담하세요."
        )

    if sugar_category == "당뇨 의심":
        warnings.append(
            "공복 혈당이 당뇨 의심 범위입니다. 재측정 또는 상담을 권장합니다."
        )

    return warnings


def analyze_health(
    weight: float,
    height: float,
    systolic: int,
    diastolic: int,
    blood_sugar: int,
    steps: int,
) -> HealthAnalysisResult:
    """건강 기록에 필요한 모든 계산과 분류를 한 번에 수행한다."""

    bmi = calculate_bmi(
        weight=weight,
        height=height,
    )

    bmi_category = classify_bmi(bmi)

    bp_category = classify_blood_pressure(
        systolic=systolic,
        diastolic=diastolic,
    )

    sugar_category = classify_blood_sugar(
        blood_sugar=blood_sugar,
    )

    step_grade = classify_steps(
        steps=steps,
    )

    warnings = create_warnings(
        bmi_category=bmi_category,
        bp_category=bp_category,
        sugar_category=sugar_category,
    )

    return {
        "bmi": bmi,
        "bmi_category": bmi_category,
        "bp_category": bp_category,
        "sugar_category": sugar_category,
        "step_grade": step_grade,
        "warnings": warnings,
    }