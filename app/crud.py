from datetime import date as DateType, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.health_service import analyze_health


# ─────────────────────────────────────────
# 사용자 CRUD
# ─────────────────────────────────────────

def create_user(
    db: Session,
    user_data: schemas.UserCreate,
) -> models.User:
    """새로운 사용자를 DB에 저장한다."""

    user = models.User(
        name=user_data.name.strip(),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def get_users(db: Session) -> list[models.User]:
    """전체 사용자를 조회한다."""

    statement = select(models.User).order_by(models.User.id)

    return list(db.scalars(statement).all())


def get_user(
    db: Session,
    user_id: int,
) -> models.User | None:
    """ID로 사용자 한 명을 조회한다."""

    return db.get(models.User, user_id)


# ─────────────────────────────────────────
# 건강 기록 CRUD
# ─────────────────────────────────────────

def create_health_record(
    db: Session,
    record_data: schemas.HealthRecordCreate,
) -> models.HealthRecord:
    """
    건강 상태를 분석하고,
    입력값과 분석 결과를 DB에 저장한다.
    """

    analysis = analyze_health(
        weight=record_data.weight,
        height=record_data.height,
        systolic=record_data.systolic,
        diastolic=record_data.diastolic,
        blood_sugar=record_data.blood_sugar,
        steps=record_data.steps,
    )

    health_record = models.HealthRecord(
        **record_data.model_dump(),
        **analysis,
    )

    db.add(health_record)
    db.commit()
    db.refresh(health_record)

    return health_record


def get_health_records(
    db: Session,
    user_id: int | None = None,
) -> list[models.HealthRecord]:
    """건강 기록을 최신 측정일 순으로 조회한다."""

    statement = select(models.HealthRecord)

    if user_id is not None:
        statement = statement.where(
            models.HealthRecord.user_id == user_id
        )

    statement = statement.order_by(
        models.HealthRecord.date.desc(),
        models.HealthRecord.id.desc(),
    )

    return list(db.scalars(statement).all())

def get_health_record(
    db: Session,
    record_id: int,
) -> models.HealthRecord | None:
    """ID로 건강 기록 한 건을 조회한다."""

    return db.get(models.HealthRecord, record_id)


def update_health_record(
    db: Session,
    health_record: models.HealthRecord,
    record_data: schemas.HealthRecordUpdate,
) -> models.HealthRecord:
    """
    기존 건강 기록을 수정하고,
    BMI와 건강 상태를 다시 계산한다.
    """

    analysis = analyze_health(
        weight=record_data.weight,
        height=record_data.height,
        systolic=record_data.systolic,
        diastolic=record_data.diastolic,
        blood_sugar=record_data.blood_sugar,
        steps=record_data.steps,
    )

    input_values = record_data.model_dump()

    for field_name, value in input_values.items():
        setattr(health_record, field_name, value)

    for field_name, value in analysis.items():
        setattr(health_record, field_name, value)

    db.commit()
    db.refresh(health_record)

    return health_record


def delete_health_record(
    db: Session,
    health_record: models.HealthRecord,
) -> int:
    """건강 기록을 삭제하고 삭제된 ID를 반환한다."""

    deleted_id = health_record.id

    db.delete(health_record)
    db.commit()

    return deleted_id

def search_health_records(
    db: Session,
    start_date: DateType,
    end_date: DateType,
    user_id: int | None = None,
) -> list[models.HealthRecord]:
    """측정일 범위로 건강 기록을 검색한다."""

    statement = select(models.HealthRecord).where(
        models.HealthRecord.date >= start_date,
        models.HealthRecord.date <= end_date,
    )

    if user_id is not None:
        statement = statement.where(
            models.HealthRecord.user_id == user_id
        )

    statement = statement.order_by(
        models.HealthRecord.date.desc(),
        models.HealthRecord.id.desc(),
    )

    return list(db.scalars(statement).all())


def get_health_stats(
    db: Session,
    user_id: int | None = None,
) -> dict[str, int | float | None]:
    """전체 또는 특정 사용자의 건강 기록 통계를 계산한다."""

    statement = select(
        func.count(models.HealthRecord.id),
        func.avg(models.HealthRecord.weight),
        func.avg(models.HealthRecord.bmi),
        func.avg(models.HealthRecord.systolic),
        func.avg(models.HealthRecord.diastolic),
        func.avg(models.HealthRecord.blood_sugar),
        func.avg(models.HealthRecord.steps),
        func.avg(models.HealthRecord.sleep_hours),
    )

    if user_id is not None:
        statement = statement.where(
            models.HealthRecord.user_id == user_id
        )

    (
        record_count,
        average_weight,
        average_bmi,
        average_systolic,
        average_diastolic,
        average_blood_sugar,
        average_steps,
        average_sleep_hours,
    ) = db.execute(statement).one()

    def round_or_none(value: object) -> float | None:
        if value is None:
            return None

        return round(float(value), 2)

    return {
        "record_count": int(record_count or 0),
        "average_weight": round_or_none(average_weight),
        "average_bmi": round_or_none(average_bmi),
        "average_systolic": round_or_none(average_systolic),
        "average_diastolic": round_or_none(average_diastolic),
        "average_blood_sugar": round_or_none(average_blood_sugar),
        "average_steps": round_or_none(average_steps),
        "average_sleep_hours": round_or_none(
            average_sleep_hours
        ),
    }

def get_period_averages(
    db: Session,
    user_id: int,
    start_date: DateType,
    end_date: DateType,
) -> dict[str, object]:
    """지정한 기간의 건강 기록 평균을 계산한다."""

    statement = select(
        func.count(models.HealthRecord.id),
        func.avg(models.HealthRecord.weight),
        func.avg(models.HealthRecord.bmi),
        func.avg(models.HealthRecord.steps),
        func.avg(models.HealthRecord.sleep_hours),
    ).where(
        models.HealthRecord.user_id == user_id,
        models.HealthRecord.date >= start_date,
        models.HealthRecord.date <= end_date,
    )

    (
        record_count,
        average_weight,
        average_bmi,
        average_steps,
        average_sleep_hours,
    ) = db.execute(statement).one()

    def round_or_none(value: object) -> float | None:
        if value is None:
            return None

        return round(float(value), 2)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "record_count": int(record_count or 0),
        "average_weight": round_or_none(average_weight),
        "average_bmi": round_or_none(average_bmi),
        "average_steps": round_or_none(average_steps),
        "average_sleep_hours": round_or_none(
            average_sleep_hours
        ),
    }


def get_weekly_report(
    db: Session,
    user_id: int,
    end_date: DateType,
) -> dict[str, object]:
    """
    최근 7일과 직전 7일의 평균을 계산하고,
    두 기간의 차이를 반환한다.
    """

    current_start = end_date - timedelta(days=6)

    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=6)

    current_week = get_period_averages(
        db=db,
        user_id=user_id,
        start_date=current_start,
        end_date=end_date,
    )

    previous_week = get_period_averages(
        db=db,
        user_id=user_id,
        start_date=previous_start,
        end_date=previous_end,
    )

    def calculate_change(
        current_value: object,
        previous_value: object,
    ) -> float | None:
        if current_value is None or previous_value is None:
            return None

        return round(
            float(current_value) - float(previous_value),
            2,
        )

    changes = {
        "weight": calculate_change(
            current_week["average_weight"],
            previous_week["average_weight"],
        ),
        "bmi": calculate_change(
            current_week["average_bmi"],
            previous_week["average_bmi"],
        ),
        "steps": calculate_change(
            current_week["average_steps"],
            previous_week["average_steps"],
        ),
        "sleep_hours": calculate_change(
            current_week["average_sleep_hours"],
            previous_week["average_sleep_hours"],
        ),
    }

    return {
        "current_week": current_week,
        "previous_week": previous_week,
        "changes": changes,
    }