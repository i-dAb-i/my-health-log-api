from datetime import date as DateType, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.health_service import analyze_health

import secrets

from app.security import hash_password, verify_password

# ─────────────────────────────────────────
# 사용자 CRUD
# ─────────────────────────────────────────

def get_user_by_email(
    db: Session,
    email: str,
) -> models.User | None:
    """이메일로 사용자를 조회한다."""

    statement = select(models.User).where(
        func.lower(models.User.email) == email.lower()
    )

    return db.scalar(statement)


def create_patient_code(
    db: Session,
) -> str:
    """중복되지 않는 대상자 연결 코드를 생성한다."""

    while True:
        patient_code = secrets.token_hex(4).upper()

        existing_id = db.scalar(
            select(models.User.id).where(
                models.User.patient_code == patient_code
            )
        )

        if existing_id is None:
            return patient_code


def create_user(
    db: Session,
    user_data: schemas.UserCreate,
) -> models.User:
    """새로운 사용자 계정을 생성한다."""

    patient_code = None

    if user_data.role == models.UserRole.PATIENT:
        patient_code = create_patient_code(db)

    db_user = models.User(
        email=str(user_data.email).lower(),
        password_hash=hash_password(user_data.password),
        name=user_data.name.strip(),
        role=user_data.role,
        patient_code=patient_code,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user


def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> models.User | None:
    """이메일과 비밀번호로 사용자를 인증한다."""

    user = get_user_by_email(
        db=db,
        email=email,
    )

    if user is None:
        return None

    if not verify_password(
        plain_password=password,
        hashed_password=user.password_hash,
    ):
        return None

    return user


def get_users(
    db: Session,
) -> list[models.User]:
    """전체 사용자를 조회한다."""

    statement = select(models.User).order_by(
        models.User.id.asc()
    )

    return list(db.scalars(statement).all())


def get_user(
    db: Session,
    user_id: int,
) -> models.User | None:
    """사용자 ID로 사용자를 조회한다."""

    return db.get(
        models.User,
        user_id,
    )

# ─────────────────────────────────────────
# 건강 기록 CRUD
# ─────────────────────────────────────────

def create_health_record(
    db: Session,
    record_data: schemas.HealthRecordCreate,
    created_by_user_id: int,
) -> models.HealthRecord:
    """건강 기록을 계산하고 데이터베이스에 저장한다."""

    analysis = analyze_health(
        weight=record_data.weight,
        height=record_data.height,
        systolic=record_data.systolic,
        diastolic=record_data.diastolic,
        blood_sugar=record_data.blood_sugar,
        steps=record_data.steps,
    )

    db_record = models.HealthRecord(
        **record_data.model_dump(),
        created_by_user_id=created_by_user_id,
        **analysis,
    )

    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return db_record


def get_health_records(
    db: Session,
    user_ids: list[int] | None = None,
) -> list[models.HealthRecord]:
    """허용된 사용자들의 건강 기록을 조회한다."""

    if user_ids == []:
        return []

    statement = select(
        models.HealthRecord
    ).order_by(
        models.HealthRecord.date.desc(),
        models.HealthRecord.id.desc(),
    )

    if user_ids is not None:
        statement = statement.where(
            models.HealthRecord.user_id.in_(user_ids)
        )

    return list(
        db.scalars(statement).all()
    )

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
    user_ids: list[int] | None = None,
) -> list[models.HealthRecord]:
    """기간과 접근 가능한 사용자 범위로 기록을 검색한다."""

    if user_ids == []:
        return []

    statement = select(
        models.HealthRecord
    ).where(
        models.HealthRecord.date >= start_date,
        models.HealthRecord.date <= end_date,
    )

    if user_ids is not None:
        statement = statement.where(
            models.HealthRecord.user_id.in_(user_ids)
        )

    statement = statement.order_by(
        models.HealthRecord.date.desc(),
        models.HealthRecord.id.desc(),
    )

    return list(
        db.scalars(statement).all()
    )


def get_health_stats(
    db: Session,
    user_ids: list[int] | None = None,
) -> dict[str, object]:
    """접근 가능한 건강 기록의 평균 통계를 계산한다."""

    if user_ids == []:
        return {
            "user_id": None,
            "record_count": 0,
            "average_weight": None,
            "average_bmi": None,
            "average_systolic": None,
            "average_diastolic": None,
            "average_blood_sugar": None,
            "average_steps": None,
            "average_sleep_hours": None,
        }

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

    if user_ids is not None:
        statement = statement.where(
            models.HealthRecord.user_id.in_(user_ids)
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

    response_user_id = None

    if user_ids is not None and len(user_ids) == 1:
        response_user_id = user_ids[0]

    return {
        "user_id": response_user_id,
        "record_count": int(record_count or 0),
        "average_weight": round_or_none(average_weight),
        "average_bmi": round_or_none(average_bmi),
        "average_systolic": round_or_none(average_systolic),
        "average_diastolic": round_or_none(average_diastolic),
        "average_blood_sugar": round_or_none(
            average_blood_sugar
        ),
        "average_steps": round_or_none(average_steps),
        "average_sleep_hours": round_or_none(
            average_sleep_hours
        ),
    }

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

def get_user_by_patient_code(
    db: Session,
    patient_code: str,
) -> models.User | None:
    """연결 코드로 대상자를 조회한다."""

    normalized_code = patient_code.strip().upper()

    statement = select(models.User).where(
        models.User.patient_code == normalized_code,
        models.User.role == models.UserRole.PATIENT,
    )

    return db.scalar(statement)


def get_guardian_link_by_pair(
    db: Session,
    guardian_id: int,
    patient_id: int,
) -> models.GuardianPatientLink | None:
    """동일한 보호자·대상자 연결이 있는지 조회한다."""

    statement = select(
        models.GuardianPatientLink
    ).where(
        models.GuardianPatientLink.guardian_id == guardian_id,
        models.GuardianPatientLink.patient_id == patient_id,
    )

    return db.scalar(statement)


def create_guardian_link(
    db: Session,
    guardian_id: int,
    patient_id: int,
    relation_type: str | None,
) -> models.GuardianPatientLink:
    """보호자·대상자 연결 요청을 생성한다."""

    normalized_relation = None

    if relation_type:
        normalized_relation = relation_type.strip() or None

    db_link = models.GuardianPatientLink(
        guardian_id=guardian_id,
        patient_id=patient_id,
        relation_type=normalized_relation,
        status=models.LinkStatus.PENDING,
    )

    db.add(db_link)
    db.commit()
    db.refresh(db_link)

    return db_link

def get_guardian_link(
    db: Session,
    link_id: int,
) -> models.GuardianPatientLink | None:
    """연결 관계를 ID로 조회한다."""

    return db.get(
        models.GuardianPatientLink,
        link_id,
    )


def get_guardian_links_for_user(
    db: Session,
    user: models.User,
) -> list[models.GuardianPatientLink]:
    """현재 사용자의 역할에 맞는 연결 관계를 조회한다."""

    statement = select(
        models.GuardianPatientLink
    ).order_by(
        models.GuardianPatientLink.id.desc()
    )

    if user.role == models.UserRole.GUARDIAN:
        statement = statement.where(
            models.GuardianPatientLink.guardian_id == user.id
        )

    elif user.role == models.UserRole.PATIENT:
        statement = statement.where(
            models.GuardianPatientLink.patient_id == user.id
        )

    return list(
        db.scalars(statement).all()
    )


def update_guardian_link_status(
    db: Session,
    link: models.GuardianPatientLink,
    new_status: models.LinkStatus,
) -> models.GuardianPatientLink:
    """보호자 연결 요청의 상태를 변경한다."""

    link.status = new_status

    db.commit()
    db.refresh(link)

    return link


def get_approved_patient_ids(
    db: Session,
    guardian_id: int,
) -> list[int]:
    """보호자가 조회할 수 있는 승인된 대상자 ID를 반환한다."""

    statement = select(
        models.GuardianPatientLink.patient_id
    ).where(
        models.GuardianPatientLink.guardian_id == guardian_id,
        models.GuardianPatientLink.status
        == models.LinkStatus.APPROVED,
    )

    return list(
        db.scalars(statement).all()
    )

def get_accessible_patients(
    db: Session,
    user: models.User,
) -> list[models.User]:
    """현재 사용자가 접근할 수 있는 대상자 목록을 조회한다."""

    statement = select(
        models.User
    ).where(
        models.User.role == models.UserRole.PATIENT,
        models.User.is_active.is_(True),
    ).order_by(
        models.User.name.asc(),
        models.User.id.asc(),
    )

    if user.role == models.UserRole.ADMIN:
        return list(
            db.scalars(statement).all()
        )

    if user.role == models.UserRole.PATIENT:
        statement = statement.where(
            models.User.id == user.id
        )

        return list(
            db.scalars(statement).all()
        )

    approved_patient_ids = get_approved_patient_ids(
        db=db,
        guardian_id=user.id,
    )

    if not approved_patient_ids:
        return []

    statement = statement.where(
        models.User.id.in_(approved_patient_ids)
    )

    return list(
        db.scalars(statement).all()
    )