import getpass

from sqlalchemy import func, select

from app import models
from app.database import SessionLocal
from app.security import hash_password


def main() -> None:
    """터미널 입력을 받아 관리자 계정을 생성한다."""

    email = input("관리자 이메일: ").strip().lower()
    name = input("관리자 이름: ").strip()
    password = getpass.getpass("관리자 비밀번호: ")
    password_confirm = getpass.getpass("비밀번호 확인: ")

    if not email:
        print("오류: 이메일을 입력해야 합니다.")
        return

    if not name:
        print("오류: 이름을 입력해야 합니다.")
        return

    if len(password) < 8:
        print("오류: 비밀번호는 8자 이상이어야 합니다.")
        return

    if password != password_confirm:
        print("오류: 비밀번호가 일치하지 않습니다.")
        return

    with SessionLocal() as db:
        existing_user = db.scalar(
            select(models.User).where(
                func.lower(models.User.email) == email
            )
        )

        if existing_user is not None:
            print("오류: 이미 등록된 이메일입니다.")
            return

        admin = models.User(
            email=email,
            password_hash=hash_password(password),
            name=name,
            role=models.UserRole.ADMIN,
            is_active=True,
            patient_code=None,
        )

        db.add(admin)
        db.commit()
        db.refresh(admin)

        print(
            f"관리자 계정 생성 완료: "
            f"id={admin.id}, email={admin.email}"
        )


if __name__ == "__main__":
    main()